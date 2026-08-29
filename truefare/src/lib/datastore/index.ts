import { LocalAdapter } from './LocalAdapter';
import type { DataStore } from './types';

let store: DataStore | null = null;

/**
 * Guest mode (LocalAdapter) by default. When Supabase is configured AND
 * a session exists, auth wiring swaps in the SupabaseAdapter via
 * setDataStore — every consumer picks it up on next call.
 */
export function getDataStore(): DataStore {
  if (!store) store = new LocalAdapter();
  return store;
}

export function setDataStore(next: DataStore): void {
  store = next;
}

export type { DataStore } from './types';
