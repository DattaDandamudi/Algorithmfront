/**
 * Keyframes used by the phone mock and hero. Tailwind v4 arbitrary
 * `animate-[name_…]` classes reference these names.
 */
export function MarketingStyles() {
  return (
    <style>{`
@keyframes cc-pop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes cc-typing { 0%, 80%, 100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-3px); opacity: 1; } }
@keyframes cc-ring { 0%, 100% { transform: rotate(0); } 10% { transform: rotate(-12deg); } 20% { transform: rotate(10deg); } 30% { transform: rotate(-8deg); } 40% { transform: rotate(6deg); } 50% { transform: rotate(0); } }
@keyframes cc-pulse-ring { 0% { transform: scale(.9); opacity: .7; } 100% { transform: scale(1.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .cc-motion { animation: none !important; opacity: 1 !important; transform: none !important; }
}
`}</style>
  );
}
