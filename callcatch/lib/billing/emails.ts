// Server-only: transactional billing emails (dunning, trial reminders).
import { sendEmail } from "@/lib/email/send";
import { env } from "@/lib/env";
import { formatUsd } from "@/lib/utils";
import { formatDate } from "@/lib/billing/plans-ui";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@callcatch.co";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function layout(title: string, bodyHtml: string, cta?: { href: string; label: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#ff6a1a;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${esc(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#fbfaf7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1f3a">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <p style="font-weight:700;letter-spacing:.02em;color:#0b1f3a;margin:0 0 20px">CallCatch</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${esc(title)}</h1>
    <div style="font-size:15px;line-height:1.6">${bodyHtml}</div>
    ${button}
    <p style="font-size:12px;color:#4f75b5;margin-top:32px">Questions? Reply to this email or write to ${esc(SUPPORT_EMAIL)}.</p>
  </div></body></html>`;
}

export async function sendDunningNotice(input: {
  to: string;
  businessName: string;
  amountDueUsd: number;
  hostedInvoiceUrl?: string | null;
  nextAttemptAt?: string | null;
}): Promise<void> {
  const billingUrl = `${env.appUrl()}/billing`;
  const retry = input.nextAttemptAt ? `We'll retry automatically on ${formatDate(input.nextAttemptAt)}.` : "We'll retry automatically over the next few days.";
  const html = layout(
    "Your CallCatch payment didn't go through",
    `<p>Hi ${esc(input.businessName)},</p>
     <p>We tried to charge ${esc(formatUsd(input.amountDueUsd))} for your CallCatch subscription and the card was declined. ${esc(retry)}</p>
     <p>To keep every missed call texting back, update your card now — it takes under a minute.</p>
     <p style="font-size:13px;color:#22427a">If the payment keeps failing your text-backs will pause until it's fixed. Nothing is deleted.</p>`,
    { href: input.hostedInvoiceUrl ?? billingUrl, label: "Update payment method" }
  );
  await sendEmail({
    to: input.to,
    subject: "Action needed: your CallCatch payment failed",
    html,
    text: `We couldn't charge ${formatUsd(input.amountDueUsd)} for your CallCatch subscription. ${retry} Update your card: ${input.hostedInvoiceUrl ?? billingUrl}`,
    tags: [{ name: "type", value: "dunning_1" }],
  });
}

export async function sendTrialEndingReminder(input: {
  to: string;
  businessName: string;
  trialEndIso: string;
  planName: string;
  priceUsd: number;
  interval: "month" | "year";
}): Promise<void> {
  const billingUrl = `${env.appUrl()}/billing`;
  const per = input.interval === "year" ? "year" : "month";
  const html = layout(
    `Your free trial ends ${formatDate(input.trialEndIso)}`,
    `<p>Hi ${esc(input.businessName)},</p>
     <p>Your CallCatch ${esc(input.planName)} trial ends on <strong>${esc(formatDate(input.trialEndIso))}</strong>. After that your card on file is charged ${esc(formatUsd(input.priceUsd))}/${per} and every missed call keeps texting back automatically.</p>
     <p>Want to change plans, pause for the slow season or cancel? Do it from your billing page any time before then.</p>`,
    { href: billingUrl, label: "Review my plan" }
  );
  await sendEmail({
    to: input.to,
    subject: `Your CallCatch trial ends ${formatDate(input.trialEndIso)}`,
    html,
    text: `Your CallCatch ${input.planName} trial ends ${formatDate(input.trialEndIso)}. Then ${formatUsd(input.priceUsd)}/${per}. Manage: ${billingUrl}`,
    tags: [{ name: "type", value: "trial_ending" }],
  });
}

export async function sendTrialExtendedPendingVerification(input: {
  to: string;
  businessName: string;
  newTrialEndIso: string;
}): Promise<void> {
  const html = layout(
    "Still waiting on the carriers — we extended your trial",
    `<p>Hi ${esc(input.businessName)},</p>
     <p>Your number is still in toll-free verification with the carriers, so your free trial hasn't really started yet. We pushed your trial end to <strong>${esc(formatDate(input.newTrialEndIso))}</strong> — you won't be charged before your text-backs are live.</p>
     <p>The moment the carriers approve the number, your 14-day clock starts and we'll email you.</p>`,
    { href: `${env.appUrl()}/onboarding`, label: "Check verification status" }
  );
  await sendEmail({
    to: input.to,
    subject: "We extended your CallCatch trial while verification finishes",
    html,
    text: `Your number is still in carrier verification, so we moved your trial end to ${formatDate(input.newTrialEndIso)}. You won't be charged before text-backs are live.`,
    tags: [{ name: "type", value: "trial_extended" }],
  });
}

export async function sendPausedConfirmation(input: { to: string; businessName: string; resumesOnIso: string }): Promise<void> {
  const html = layout(
    `Paused until ${formatDate(input.resumesOnIso)}`,
    `<p>Hi ${esc(input.businessName)},</p>
     <p>Your CallCatch subscription is paused. You won't be billed, and text-backs are off, until <strong>${esc(formatDate(input.resumesOnIso))}</strong>. Missed calls still get the voicemail greeting, and you can resume early from your billing page.</p>`,
    { href: `${env.appUrl()}/billing`, label: "Manage billing" }
  );
  await sendEmail({
    to: input.to,
    subject: `CallCatch paused until ${formatDate(input.resumesOnIso)}`,
    html,
    text: `Your CallCatch subscription is paused until ${formatDate(input.resumesOnIso)}. Resume any time: ${env.appUrl()}/billing`,
    tags: [{ name: "type", value: "paused" }],
  });
}
