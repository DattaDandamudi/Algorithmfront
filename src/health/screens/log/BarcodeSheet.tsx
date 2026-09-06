/**
 * BarcodeSheet — SPEC §2 "Barcode (secondary)".
 *
 * Manual entry (numeric code + Look up) works everywhere. On browsers with
 * the Shape Detection API (`'BarcodeDetector' in window`: Chrome/Edge/
 * Android, Safari 17+) a Scan button opens the rear camera in a <video> and
 * decodes EAN-13/EAN-8/UPC-A/UPC-E on-device ~4×/s; decoding never leaves the
 * phone. The code goes to ai/barcode.ts (Open Food Facts — the app's only
 * non-AI third-party call, made only here) and the label values flow into
 * the shared EstimateSheet, so the serving grams are confirmed and every
 * value is editable before save. Camera tracks stop on Stop/close/unmount
 * and an in-flight lookup is aborted on close.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Loader2, Search } from 'lucide-react';
import type { FoodEstimate } from '../../data/types';
import { lookupBarcode, normaliseBarcode } from '../../ai/barcode';
import { Button, Sheet } from '../../ui';
import { BARCODE_FORMATS, SCAN_INTERVAL_MS, cameraErrorMessage, getBarcodeDetector, isBarcodeScanSupported, pickBarcode, type BarcodeDetectorLike } from './barcodeScanner';

export interface BarcodeSheetProps {
  open: boolean;
  onClose: () => void;
  /** A product was found — the caller opens the estimate sheet with it. */
  onResult: (est: FoodEstimate, code: string) => void;
  /** Close and focus the text bar. */
  onUseTextBar: () => void;
}

type Msg = { kind: 'error' | 'info'; text: string } | null;

export default function BarcodeSheet({ open, onClose, onResult, onUseTextBar }: BarcodeSheetProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [scanning, setScanning] = useState(false);
  const supported = isBarcodeScanSupported();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stopScan = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  const lookup = useCallback(async (raw: string) => {
    const digits = normaliseBarcode(raw);
    if (!digits) {
      setMsg({ kind: 'error', text: 'Enter the 8–14 digit number printed under the bars.' });
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setMsg(null);
    try {
      const est = await lookupBarcode(digits, ac.signal);
      if (ac.signal.aborted) return;
      if (!est) {
        setMsg({ kind: 'info', text: `No nutrition data for ${digits} on Open Food Facts — type the label values into the text bar instead.` });
      } else {
        setCode('');
        onResultRef.current(est, digits);
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Lookup failed — try again.' });
    } finally {
      if (abortRef.current === ac) setBusy(false);
    }
  }, []);

  const startScan = useCallback(async () => {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!getBarcodeDetector() || !md?.getUserMedia) return;
    setMsg(null);
    try {
      const stream = await md.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      setScanning(true);
    } catch (e) {
      setMsg({ kind: 'error', text: cameraErrorMessage(e) });
    }
  }, []);

  // Feed the stream to the <video> (it only exists while scanning) and poll the detector.
  useEffect(() => {
    if (!scanning) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    const Ctor = getBarcodeDetector();
    if (!video || !stream || !Ctor) {
      stopScan();
      return;
    }
    let detector: BarcodeDetectorLike;
    try {
      detector = new Ctor({ formats: [...BARCODE_FORMATS] });
    } catch {
      setMsg({ kind: 'error', text: 'This browser cannot decode retail barcodes — type the code instead.' });
      stopScan();
      return;
    }
    video.srcObject = stream;
    void video.play().catch(() => {
      /* autoplay refused — the user tapped Scan, so this is rare; the frame still renders when play resolves later */
    });
    let detecting = false;
    let done = false;
    const tick = async () => {
      if (done || detecting || video.readyState < 2) return;
      detecting = true;
      try {
        const found = pickBarcode(await detector.detect(video));
        if (found && !done) {
          done = true;
          stopScan();
          setCode(found);
          void lookup(found);
        }
      } catch {
        /* transient decode error — try the next frame */
      } finally {
        detecting = false;
      }
    };
    const timer = window.setInterval(() => void tick(), SCAN_INTERVAL_MS);
    return () => {
      done = true;
      window.clearInterval(timer);
    };
  }, [scanning, stopScan, lookup]);

  // Closing releases the camera and cancels the lookup; unmount does the same.
  useEffect(() => {
    if (open) return;
    stopScan();
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setMsg(null);
  }, [open, stopScan]);
  useEffect(
    () => () => {
      stopScan();
      abortRef.current?.abort();
    },
    [stopScan],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void lookup(code);
  };
  const valid = normaliseBarcode(code) !== null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Scan a barcode"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onUseTextBar}>
            Type it instead
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] leading-5 text-hx-text2">
          Packaged food only — reads the label values from <span className="text-hx-text">Open Food Facts</span>, a public database. No account; only the barcode digits are sent, and only when
          you look one up. Restaurant dishes go in the text bar.
        </p>

        <form onSubmit={submit} className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9 -]*"
            autoComplete="off"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              if (msg) setMsg(null);
            }}
            placeholder="Digits under the bars"
            aria-label="Barcode number"
            className="flex-1 min-w-0 h-11 px-3 text-[15px] font-semibold"
            disabled={busy}
          />
          <Button type="submit" size="md" loading={busy} disabled={!valid || busy} icon={<Search aria-hidden />}>
            Look up
          </Button>
        </form>

        {scanning ? (
          <div className="space-y-2">
            <video ref={videoRef} className="w-full aspect-[4/3] rounded-2xl bg-black object-cover" muted playsInline autoPlay aria-label="Camera preview — point it at the barcode" />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] leading-5 text-hx-text2">Point the camera at the barcode — it locks on by itself.</p>
              <Button variant="secondary" size="md" onClick={stopScan}>
                Stop
              </Button>
            </div>
          </div>
        ) : supported ? (
          <Button variant="secondary" size="lg" fullWidth icon={<Camera aria-hidden />} onClick={() => void startScan()} disabled={busy}>
            Scan with camera
          </Button>
        ) : (
          <p className="text-[12px] leading-4 text-hx-muted">Camera scanning needs a browser with barcode detection (Chrome, Edge, Safari 17+). Typing the number works everywhere.</p>
        )}

        {busy && (
          <p role="status" className="flex items-center gap-2 text-[13px] leading-5 text-hx-text2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Looking up {normaliseBarcode(code)}…
          </p>
        )}
        {msg && (
          <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`text-[13px] leading-5 ${msg.kind === 'error' ? 'text-hx-red' : 'text-hx-yellow'}`}>
            {msg.text}
          </p>
        )}
      </div>
    </Sheet>
  );
}
