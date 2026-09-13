import type { ReactNode } from "react";
import { openPortalAction } from "@/app/(app)/billing/actions";
import type { PortalFlow } from "@/lib/billing/manage";
import { btn } from "@/components/billing/ui";

/**
 * Server-rendered form that opens the Stripe Customer Portal via a Server Function.
 * No client JS needed; the action redirects to Stripe.
 */
export function PortalButton({ flow = "home", variant = "secondary", disabled, children }: { flow?: PortalFlow; variant?: keyof typeof btn; disabled?: boolean; children: ReactNode }) {
  return (
    <form action={openPortalAction}>
      <input type="hidden" name="flow" value={flow} />
      <button type="submit" disabled={disabled} className={btn[variant]}>
        {children}
      </button>
    </form>
  );
}
