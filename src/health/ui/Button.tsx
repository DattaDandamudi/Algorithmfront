/**
 * Button — the one button set (primary / secondary / ghost / danger).
 *
 * Primary is an ink key: lume ground, stock text, 4 px radius, no shadow.
 * Secondary is a 1 px text2 outline. Ghost is an underlined verb (1 px rule,
 * 3 px offset) with a 44 px hit area and no horizontal padding, so it can sit
 * flush with a margin. Danger is a red outline and word. Keys settle a pixel
 * on press. Sizes: sm and md are 44 px, lg is 48 px. Words are .hx-ui and
 * verbs from the user's side with no arrows. The `icon` slot stays for
 * callers, but the design wants icons only for loading; the spinner sets
 * aria-busy and disables the control so double-taps cannot fire. Focus ring
 * comes from health.css.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (pass a lucide element with aria-hidden). Prefer a verb. */
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-hx-lume text-hx-base rounded-ctl hover:bg-hx-text active:translate-y-px disabled:bg-hx-text2',
  secondary: 'bg-transparent text-hx-text border border-hx-text2 rounded-ctl hover:border-hx-text active:translate-y-px',
  ghost: 'bg-transparent text-hx-text2 hover:text-hx-text underline decoration-1 underline-offset-[3px]',
  danger: 'bg-transparent text-hx-red border border-hx-red rounded-ctl hover:bg-hx-red/15 active:translate-y-px',
};

const HEIGHT: Record<ButtonSize, string> = {
  sm: 'h-11 min-w-11',
  md: 'h-11 min-w-11',
  lg: 'h-12 min-w-12',
};

const PAD: Record<ButtonSize, string> = { sm: 'px-3', md: 'px-4', lg: 'px-5' };

const ICON_PX: Record<ButtonSize, string> = { sm: 'w-4 h-4', md: 'w-[18px] h-[18px]', lg: 'w-5 h-5' };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading = false, fullWidth = false, className = '', disabled, children, type = 'button', ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  const pad = variant === 'ghost' ? 'px-1 min-w-0' : PAD[size];
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`hx-ui hx-press inline-flex items-center justify-center gap-2 select-none disabled:opacity-60 disabled:cursor-not-allowed ${VARIANT[variant]} ${HEIGHT[size]} ${pad} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className={`${ICON_PX[size]} animate-spin motion-reduce:animate-none shrink-0`} strokeWidth={1.5} aria-hidden />
      ) : (
        icon && <span className={`${ICON_PX[size]} shrink-0 inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full`}>{icon}</span>
      )}
      {children}
    </button>
  );
});

export default Button;
