import { signInWithGoogle } from "../actions";
import type { PlanParams } from "./next-path";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden focusable="false">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

/** Server-action form button: the action builds the Google OAuth URL and redirects. */
export function GoogleButton({ flow, next, plan }: { flow: "login" | "signup"; next?: string; plan?: PlanParams }) {
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="flow" value={flow} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {plan?.plan ? <input type="hidden" name="plan" value={plan.plan} /> : null}
      {plan?.interval ? <input type="hidden" name="interval" value={plan.interval} /> : null}
      {plan?.path ? <input type="hidden" name="path" value={plan.path} /> : null}
      {plan?.ref ? <input type="hidden" name="ref" value={plan.ref} /> : null}
      {plan?.setup ? <input type="hidden" name="setup" value={plan.setup} /> : null}
      <button
        type="submit"
        className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-brand-200 bg-white text-sm font-semibold text-brand-900 transition hover:border-brand-300 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2"
      >
        <GoogleGlyph />
        Continue with Google
      </button>
    </form>
  );
}

export function OrDivider() {
  return (
    <div className="relative my-5" role="separator" aria-label="or">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-brand-100" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-white px-3 text-xs font-medium uppercase tracking-wider text-brand-400">or</span>
      </div>
    </div>
  );
}
