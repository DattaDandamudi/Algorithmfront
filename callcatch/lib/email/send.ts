import { Resend } from "resend";
import { env } from "@/lib/env";

let client: Resend | null = null;
function resend(): Resend {
  if (!client) client = new Resend(env.required("RESEND_API_KEY"));
  return client;
}

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  /** Overrides RESEND_FROM_EMAIL (e.g. the founder's outreach mailbox). */
  from?: string;
  /** Extra SMTP headers (List-Unsubscribe, In-Reply-To...). */
  headers?: Record<string, string>;
};

/** Sends a transactional email via Resend. Returns the provider message id. */
export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null }> {
  const from = input.from ?? env.get("RESEND_FROM_EMAIL", "CallCatch <hello@callcatch.co>")!;
  const { data, error } = await resend().emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    tags: input.tags,
    headers: input.headers,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return { id: data?.id ?? null };
}
