/**
 * Context + hook for the Settings confirmation sheet. Lives apart from the
 * provider component so `confirm.tsx` only exports a component (keeps React
 * Fast Refresh happy) while every section can still `useConfirm()`.
 */
import { createContext, useContext, type ReactNode } from 'react';

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** The user must type this exact text before the confirm button enables. */
  requireText?: string;
  /** Optional extra footer action (e.g. "Export JSON first"); does not close the sheet. */
  secondary?: { label: string; onClick: () => void };
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return fn;
}
