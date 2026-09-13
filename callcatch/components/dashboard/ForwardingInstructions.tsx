import { formatPhone } from "@/lib/telephony/client";

/** Carrier-specific "forward when busy / no answer" steps. Codes are the US carrier conventions. */
export function ForwardingInstructions({ number }: { number: string | null }) {
  const digits = number ? number.replace(/^\+1/, "") : "your CallCatch number";
  const pretty = number ? formatPhone(number) : "your CallCatch number";
  const rows: { carrier: string; on: string; off: string }[] = [
    { carrier: "Verizon", on: `*71${digits}`, off: "*73" },
    { carrier: "AT&T", on: `*61*${digits}#  then  *62*${digits}#`, off: "#61#  then  #62#" },
    { carrier: "T-Mobile / Sprint", on: `**61*${digits}#  then  **62*${digits}#`, off: "##61#  then  ##62#" },
    { carrier: "Google Voice", on: "Settings → Calls → Forward calls → add number, then set voicemail to “forward to number”", off: "Remove the forwarding number" },
    { carrier: "RingCentral / Grasshopper", on: `Admin portal → Call handling → “If unanswered” → forward to ${pretty}`, off: "Set “If unanswered” back to voicemail" },
    { carrier: "Landline (most)", on: `*92${digits} (busy: *90${digits})`, off: "*93 (busy: *91)" },
  ];
  return (
    <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">Call forwarding codes by carrier</caption>
        <thead>
          <tr className="border-b border-brand-100 bg-brand-50/60 text-xs font-semibold uppercase tracking-wide text-brand-500">
            <th scope="col" className="px-3 py-2">Carrier</th>
            <th scope="col" className="px-3 py-2">Turn on (dial from your business phone)</th>
            <th scope="col" className="px-3 py-2">Turn off</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-100">
          {rows.map((r) => (
            <tr key={r.carrier}>
              <td className="px-3 py-2 font-medium text-brand-900">{r.carrier}</td>
              <td className="px-3 py-2 font-mono text-xs text-brand-800">{r.on}</td>
              <td className="px-3 py-2 font-mono text-xs text-brand-600">{r.off}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-3 py-2 text-xs text-brand-500">
        Forwarding only kicks in when you don&apos;t answer — you keep your number and answer calls exactly like before.
      </p>
    </div>
  );
}
