/**
 * Boot gate: event logging waits until the auth layer has decided which
 * DataStore is active, so signed-in users never leak early events into
 * the guest store. Resolved immediately when Supabase isn't configured.
 */
let resolveReady: () => void = () => {};

export const dataStoreReady: Promise<void> = new Promise((resolve) => {
  resolveReady = resolve;
});

export function markDataStoreReady(): void {
  resolveReady();
}
