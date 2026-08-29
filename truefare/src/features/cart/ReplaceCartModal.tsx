import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useCatalog } from '../catalog/useCatalog';
import { useCartStore } from './store';

/** Single-restaurant carts: confirm before starting over somewhere new. */
export function ReplaceCartModal() {
  const pending = useCartStore((s) => s.pendingReplace);
  const confirmReplace = useCartStore((s) => s.confirmReplace);
  const cancelReplace = useCartStore((s) => s.cancelReplace);
  const currentId = useCartStore((s) => s.restaurantId);
  const catalog = useCatalog();

  const current = currentId ? catalog.restaurantsById.get(currentId) : null;
  const next = pending ? catalog.restaurantsById.get(pending.restaurantId) : null;

  return (
    <Modal open={pending != null} onClose={cancelReplace} title="Start a new cart?">
      <p className="text-[14px] leading-relaxed text-muted">
        Your cart has food from <span className="font-semibold text-ink">{current?.name}</span>.
        A cart compares best from one kitchen — adding this from{' '}
        <span className="font-semibold text-ink">{next?.name}</span> starts fresh.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={cancelReplace}>
          Keep my cart
        </Button>
        <Button onClick={confirmReplace}>Start new cart</Button>
      </div>
    </Modal>
  );
}
