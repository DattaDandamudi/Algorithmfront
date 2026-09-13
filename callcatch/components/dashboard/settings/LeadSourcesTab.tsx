import Link from "next/link";
import { Lock, Mail, Webhook, Zap } from "lucide-react";
import type { AccountRow, LeadSourceRow } from "@/lib/db/types";
import { can } from "@/lib/plans";
import {
  createLeadSourceAction,
  regenerateSecretAction,
  toggleLeadSourceAction,
} from "@/app/(app)/settings/actions";
import { ActionForm } from "../ActionForm";
import { CopyButton } from "../CopyButton";
import { Card, CardTitle, Notice, btn } from "../primitives";
import { StatusPill } from "../StatusPill";
import { inboundAddressFor, webhookUrlFor } from "./lead-source-helpers";
import { formatDate } from "../format";

function SourceRow({
  source,
  account,
  readOnly,
}: {
  source: LeadSourceRow;
  account: AccountRow;
  readOnly: boolean;
}) {
  const isEmail = source.type === "resend_inbox";
  const Icon = isEmail ? Mail : source.type === "zapier" ? Zap : Webhook;
  const label = isEmail
    ? "Inbound email"
    : source.type === "zapier"
      ? "Zapier"
      : "Webhook";
  const url = webhookUrlFor(account.referral_code);
  return (
    <li className="rounded-xl border border-brand-100 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Icon className="h-4.5 w-4.5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">{label}</p>
            <p className="text-xs text-brand-500">
              Added {formatDate(source.created_at, account.timezone)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={source.enabled ? "success" : "neutral"}>
            {source.enabled ? "Enabled" : "Paused"}
          </StatusPill>
          <ActionForm
            action={toggleLeadSourceAction}
            readOnly={readOnly}
            hideSubmit
            className="gap-0"
          >
            <input type="hidden" name="id" value={source.id} />
            <input
              type="hidden"
              name="enabled"
              value={source.enabled ? "false" : "true"}
            />
            <button type="submit" disabled={readOnly} className={btn.small}>
              {source.enabled ? "Pause" : "Enable"}
            </button>
          </ActionForm>
        </div>
      </div>

      <dl className="mt-3 space-y-2 text-sm">
        {isEmail ? (
          <div className="flex flex-wrap items-center gap-2">
            <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-brand-500">
              Address
            </dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-900">
                {source.inbound_email ??
                  inboundAddressFor(account.referral_code)}
              </code>
              <CopyButton
                value={
                  source.inbound_email ??
                  inboundAddressFor(account.referral_code)
                }
              />
            </dd>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-brand-500">
                POST URL
              </dt>
              <dd className="flex flex-wrap items-center gap-2">
                <code className="break-all rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-900">
                  {url}
                </code>
                <CopyButton value={url} />
              </dd>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-brand-500">
                Header
              </dt>
              <dd className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-900">
                  X-CallCatch-Secret: {source.webhook_secret ?? "—"}
                </code>
                {source.webhook_secret ? (
                  <CopyButton
                    value={source.webhook_secret}
                    label="Copy secret"
                  />
                ) : null}
                <ActionForm
                  action={regenerateSecretAction}
                  readOnly={readOnly}
                  hideSubmit
                  className="gap-0"
                >
                  <input type="hidden" name="id" value={source.id} />
                  <button
                    type="submit"
                    disabled={readOnly}
                    className={btn.small}
                  >
                    Regenerate
                  </button>
                </ActionForm>
              </dd>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-brand-500">
                Body (JSON)
              </dt>
              <dd>
                <code className="block whitespace-pre rounded-md bg-brand-50 px-2 py-1 text-xs text-brand-900">{`{ "name": "Dana Lee", "phone": "(512) 555-0134", "email": "dana@example.com",\n  "message": "AC blowing warm air", "source": "website" }`}</code>
              </dd>
            </div>
          </>
        )}
      </dl>
    </li>
  );
}

export function LeadSourcesTab({
  account,
  sources,
  readOnly,
}: {
  account: AccountRow;
  sources: LeadSourceRow[];
  readOnly: boolean;
}) {
  const pro = can(account, "web_form_leads");
  const hasEmail = sources.some((s) => s.type === "resend_inbox");
  const url = webhookUrlFor(account.referral_code);
  return (
    <div className="flex flex-col gap-5">
      {!pro ? (
        <Notice tone="warning">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2">
              <Lock className="h-4 w-4" aria-hidden /> Web-form, email and Meta
              lead intake is a <strong>Pro</strong> feature. Missed-call
              text-backs work on every plan.
            </span>
            <Link href="/billing" className={btn.primary}>
              Upgrade to Pro
            </Link>
          </div>
        </Notice>
      ) : null}

      <Card>
        <CardTitle sub="Every lead that hits one of these gets an instant text from your number (email reply while your line is still unverified) and an alert to you.">
          Where leads come from
        </CardTitle>
        {sources.length === 0 ? (
          <p className="rounded-xl border border-dashed border-brand-200 px-4 py-6 text-center text-sm text-brand-500">
            No lead sources yet. Add one below — it takes about a minute.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sources.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                account={account}
                readOnly={readOnly || !pro}
              />
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardTitle
            icon={<Mail className="h-5 w-5" aria-hidden />}
            sub="Forward website-form and Meta lead-notification emails here. We parse the name, phone and message."
          >
            Inbound email
          </CardTitle>
          <p className="mb-3 text-xs text-brand-600">
            Your address:{" "}
            <code className="rounded bg-brand-50 px-1.5 py-0.5">
              {inboundAddressFor(account.referral_code)}
            </code>
          </p>
          <ActionForm
            action={createLeadSourceAction}
            readOnly={readOnly || !pro || hasEmail}
            hideSubmit
          >
            <input type="hidden" name="type" value="resend_inbox" />
            <button
              type="submit"
              disabled={readOnly || !pro || hasEmail}
              className={btn.secondary}
            >
              {hasEmail ? "Address active" : "Create inbound address"}
            </button>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle
            icon={<Zap className="h-5 w-5" aria-hidden />}
            sub="Meta Instant Forms, Angi, Thumbtack — anything Zapier can trigger on."
          >
            Zapier
          </CardTitle>
          <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-brand-700">
            <li>Trigger: “Facebook Lead Ads → New Lead” (or your source).</li>
            <li>
              Action: “Webhooks by Zapier → POST”, URL{" "}
              <code className="break-all rounded bg-brand-50 px-1 py-0.5">
                {url}
              </code>
              , payload type JSON.
            </li>
            <li>
              Data: <code>name</code>, <code>phone</code>, <code>email</code>,{" "}
              <code>message</code>, <code>external_ref</code> (lead id).
            </li>
            <li>
              Headers: <code>X-CallCatch-Secret</code> = the secret shown above.
            </li>
          </ol>
          <ActionForm
            action={createLeadSourceAction}
            readOnly={readOnly || !pro}
            hideSubmit
          >
            <input type="hidden" name="type" value="zapier" />
            <button
              type="submit"
              disabled={readOnly || !pro}
              className={btn.secondary}
            >
              Add Zapier source
            </button>
          </ActionForm>
        </Card>

        <Card>
          <CardTitle
            icon={<Webhook className="h-5 w-5" aria-hidden />}
            sub="For your web developer, Make.com, or a form builder with webhooks (Gravity Forms, Typeform, Jotform)."
          >
            Generic webhook
          </CardTitle>
          <p className="mb-3 text-xs text-brand-600">
            POST JSON to the URL with the secret header. We respond 202 and text
            the lead within seconds.
          </p>
          <ActionForm
            action={createLeadSourceAction}
            readOnly={readOnly || !pro}
            hideSubmit
          >
            <input type="hidden" name="type" value="webhook" />
            <button
              type="submit"
              disabled={readOnly || !pro}
              className={btn.secondary}
            >
              Add webhook
            </button>
          </ActionForm>
        </Card>
      </div>

      <Notice tone="info">
        Your forms must include an SMS disclosure (“By submitting, you agree to
        receive texts about your request. Reply STOP to opt out.”) — it&apos;s
        what makes the instant reply compliant.
      </Notice>
    </div>
  );
}
