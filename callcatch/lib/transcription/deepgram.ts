/**
 * Voicemail transcription: download the Twilio recording (HTTP basic auth with the account
 * SID / auth token — recordings are private by default) and send the bytes to Deepgram
 * Nova-3 (`smart_format=true` gives punctuation and formatted numbers).
 */
import { env } from "@/lib/env";

export type TranscriptionResult =
  | { ok: true; transcript: string; confidence: number | null; durationSec: number | null }
  | { ok: false; reason: string };

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en";

/** Fetches `${RecordingUrl}.mp3` with Twilio basic auth. */
export async function downloadTwilioRecording(recordingUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const url = /\.(mp3|wav)$/i.test(recordingUrl) ? recordingUrl : `${recordingUrl}.mp3`;
  const auth = Buffer.from(`${env.required("TWILIO_ACCOUNT_SID")}:${env.required("TWILIO_AUTH_TOKEN")}`).toString("base64");
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`recording download failed: HTTP ${res.status}`);
  return { bytes: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "audio/mpeg" };
}

type DeepgramResponse = {
  metadata?: { duration?: number };
  results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string; confidence?: number }> }> };
};

export async function transcribeAudio(bytes: ArrayBuffer, contentType: string): Promise<TranscriptionResult> {
  const key = env.get("DEEPGRAM_API_KEY");
  if (!key) return { ok: false, reason: "DEEPGRAM_API_KEY not set" };
  const res = await fetch(DEEPGRAM_URL, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": contentType },
    body: bytes,
    signal: AbortSignal.timeout(40_000),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: `deepgram HTTP ${res.status} ${detail.slice(0, 200)}` };
  }
  const json = (await res.json()) as DeepgramResponse;
  const alt = json.results?.channels?.[0]?.alternatives?.[0];
  return {
    ok: true,
    transcript: (alt?.transcript ?? "").trim(),
    confidence: typeof alt?.confidence === "number" ? alt.confidence : null,
    durationSec: typeof json.metadata?.duration === "number" ? json.metadata.duration : null,
  };
}

/** Download + transcribe. Never throws; returns `{ ok: false }` with a reason. */
export async function transcribeRecording(recordingUrl: string): Promise<TranscriptionResult> {
  try {
    const { bytes, contentType } = await downloadTwilioRecording(recordingUrl);
    if (bytes.byteLength < 1000) return { ok: false, reason: "recording too short" };
    return await transcribeAudio(bytes, contentType);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
