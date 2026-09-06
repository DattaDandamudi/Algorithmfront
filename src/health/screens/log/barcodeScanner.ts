/**
 * barcodeScanner — camera barcode decoding support for the Log screen (§2).
 *
 * Uses the browser's built-in Shape Detection `BarcodeDetector` (Chrome/Edge/
 * Android, Safari 17+) — no library, no network, decoding stays on-device.
 * TypeScript's DOM lib does not ship these types, so a minimal shape is
 * declared here. Everything in this file is pure so it is unit-testable;
 * the camera/video plumbing lives in BarcodeSheet.
 */
import { normaliseBarcode } from '../../ai/barcode';

export interface DetectedBarcode {
  rawValue: string;
  format: string;
}

export interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectedBarcode[]>;
}

export interface BarcodeDetectorCtor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

/** Retail formats (§2 packaged foods): EAN-13 / EAN-8 / UPC-A / UPC-E. */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
/** ~4 decodes per second — enough to lock on within a second without pegging the CPU. */
export const SCAN_INTERVAL_MS = 250;

/** The `BarcodeDetector` constructor when the browser has one (`'BarcodeDetector' in window`). */
export function getBarcodeDetector(host: unknown = typeof window !== 'undefined' ? window : undefined): BarcodeDetectorCtor | null {
  const ctor = (host as { BarcodeDetector?: unknown } | undefined)?.BarcodeDetector;
  return typeof ctor === 'function' ? (ctor as BarcodeDetectorCtor) : null;
}

/** Detector present and a camera API to feed it. */
export function isBarcodeScanSupported(host: unknown = typeof window !== 'undefined' ? window : undefined): boolean {
  if (!getBarcodeDetector(host)) return false;
  const nav = (host as { navigator?: { mediaDevices?: { getUserMedia?: unknown } } } | undefined)?.navigator;
  return typeof nav?.mediaDevices?.getUserMedia === 'function';
}

/** First detection that reads as a retail barcode, normalised to digits. */
export function pickBarcode(results: ReadonlyArray<DetectedBarcode> | null | undefined): string | null {
  for (const r of results ?? []) {
    const code = normaliseBarcode(r?.rawValue ?? '');
    if (code) return code;
  }
  return null;
}

/** Readable message for a getUserMedia failure. */
export function cameraErrorMessage(e: unknown): string {
  const name = e instanceof Error ? e.name : typeof e === 'object' && e && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera permission was denied — allow it in the browser settings, or type the code.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera found — type the code instead.';
  if (name === 'NotReadableError') return 'The camera is in use by another app — close it, or type the code.';
  return 'Could not start the camera — type the code instead.';
}
