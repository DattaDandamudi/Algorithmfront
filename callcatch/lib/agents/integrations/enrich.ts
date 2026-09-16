/** Website enrichment: one homepage fetch (8s), heuristics only, nothing stored beyond the derived flags. */
export type Enrichment = {
  ok: boolean;
  title: string | null;
  emails: string[];
  phones: string[];
  uses_software: string | null;
  open_24_7: boolean;
  emergency: boolean;
  financing: boolean;
  online_booking: boolean;
  years_hint: number | null;
  error?: string;
};

const SOFTWARE_SIGNS: Array<[RegExp, string]> = [
  [/servicetitan/i, "ServiceTitan"],
  [/housecallpro|housecall pro|book\.housecallpro/i, "Housecall Pro"],
  [/getjobber|clienthub\.getjobber|jobber/i, "Jobber"],
  [/workiz/i, "Workiz"],
  [/fieldpulse/i, "FieldPulse"],
  [/servicefusion/i, "Service Fusion"],
  [/podium/i, "Podium"],
];

export async function enrichWebsite(url: string): Promise<Enrichment> {
  const empty: Enrichment = { ok: false, title: null, emails: [], phones: [], uses_software: null, open_24_7: false, emergency: false, financing: false, online_booking: false, years_hint: null };
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "CallCatchBot/1.0 (+https://callcatch.co/privacy) business-listing enrichment" },
    });
    if (!res.ok) return { ...empty, error: `http ${res.status}` };
    const html = (await res.text()).slice(0, 400_000);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const title = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html)?.[1]?.trim() ?? null;
    const emails = Array.from(new Set((html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase()).filter((e) => !/\.(png|jpg|gif|svg|webp)$/.test(e) && !/example\.com|sentry|wixpress/.test(e)))).slice(0, 5);
    const phones = Array.from(new Set((text.match(/\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g) ?? []).map((p) => p.replace(/\D/g, "")).filter((d) => d.length === 10).map((d) => `+1${d}`))).slice(0, 5);
    let uses_software: string | null = null;
    for (const [re, name] of SOFTWARE_SIGNS) {
      if (re.test(html)) {
        uses_software = name;
        break;
      }
    }
    const yearsMatch = /(\d{2})\+?\s*years/i.exec(text);
    const since = /since\s+(19\d{2}|20[0-2]\d)/i.exec(text);
    const years_hint = yearsMatch ? Number(yearsMatch[1]) : since ? new Date().getUTCFullYear() - Number(since[1]) : null;
    return {
      ok: true,
      title,
      emails,
      phones,
      uses_software,
      open_24_7: /24\s*\/\s*7|24 hours|24-hour/i.test(text),
      emergency: /emergency/i.test(text),
      financing: /financing|finance options|0% apr/i.test(text),
      online_booking: /book online|schedule online|book now/i.test(text),
      years_hint: years_hint && years_hint > 0 && years_hint < 120 ? years_hint : null,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}
