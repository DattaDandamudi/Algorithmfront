/**
 * Button — the one button style set (primary / secondary / ghost / danger).
 *
 * Primary is a lume surface: light on the dark ground, with a specular top
 * edge so it reads as a raised key, not a flat fill. Secondary is raised slate
 * glass. Every variant settles a pixel on press. Touch targets: sm 36 px (dense
 * rows), md 44 px, lg 48 px. Loading shows a spinner, sets aria-busy and
 * disables the control so double-taps can't fire. Focus ring from health.css.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (pass a lucide element with aria-hidden). */
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-hx-lume text-hx-base shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_8px_20px_-10px_rgba(233,241,255,0.45)] hover:bg-white active:bg-hx-text2 disabled:bg-hx-text2',
  secondary: 'hx-raised !rounded-ctl text-hx-text hover:border-hx-neutral',
  ghost: 'bg-transparent text-hx-text2 hover:text-hx-text hover:bg-hx-card2/60',
  danger: 'bg-hx-red/15 text-hx-red border border-hx-red/40 hover:bg-hx-red/25',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-11 min-w-11 px-3 text-[13px] rounded-ctl gap-1.5',
  md: 'h-11 min-w-11 px-4 text-[15px] rounded-ctl gap-2',
  lg: 'h-12 min-w-12 px-5 text-[15px] rounded-ctl gap-2',
};

const ICON_PX: Record<ButtonSize, string> = { sm: 'w-4 h-4', md: 'w-[18px] h-[18px]', lg: 'w-5 h-5' };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, loading = false, fullWidth = false, className = '', disabled, children, type = 'button', ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`hx-press inline-flex items-center justify-center font-semibold select-none disabled:opacity-60 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className={`${ICON_PX[size]} animate-spin motion-reduce:animate-none shrink-0`} aria-hidden />
      ) : (
        icon && <span className={`${ICON_PX[size]} shrink-0 inline-flex items-center justify-center [&>svg]:w-full [&>svg]:h-full`}>{icon}</span>
      )}
      {children}
    </button>
  );
});

export default Button;
