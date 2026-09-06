import { describe, expect, it } from 'vitest';
import { BARCODE_FORMATS, cameraErrorMessage, getBarcodeDetector, isBarcodeScanSupported, pickBarcode } from './barcodeScanner';

class FakeDetector {
  async detect() {
    return [];
  }
}

describe('getBarcodeDetector / isBarcodeScanSupported', () => {
  it('finds the constructor only when the host exposes one', () => {
    expect(getBarcodeDetector({})).toBeNull();
    expect(getBarcodeDetector(undefined)).toBeNull();
    expect(getBarcodeDetector({ BarcodeDetector: FakeDetector })).toBe(FakeDetector);
  });
  it('needs both the detector and getUserMedia', () => {
    expect(isBarcodeScanSupported({ BarcodeDetector: FakeDetector })).toBe(false);
    expect(isBarcodeScanSupported({ BarcodeDetector: FakeDetector, navigator: { mediaDevices: { getUserMedia: () => null } } })).toBe(true);
    expect(isBarcodeScanSupported({ navigator: { mediaDevices: { getUserMedia: () => null } } })).toBe(false);
  });
  it('asks for the retail formats only', () => {
    expect([...BARCODE_FORMATS]).toEqual(['ean_13', 'ean_8', 'upc_a', 'upc_e']);
  });
});

describe('pickBarcode', () => {
  it('returns the first detection that is a retail code', () => {
    expect(pickBarcode([{ rawValue: 'https://x', format: 'qr_code' }, { rawValue: '5000159484695', format: 'ean_13' }])).toBe('5000159484695');
    expect(pickBarcode([{ rawValue: 'abc', format: 'code_128' }])).toBeNull();
    expect(pickBarcode([])).toBeNull();
    expect(pickBarcode(null)).toBeNull();
  });
});

describe('cameraErrorMessage', () => {
  it('maps the common getUserMedia errors to plain copy', () => {
    const err = (name: string) => Object.assign(new Error(name), { name });
    expect(cameraErrorMessage(err('NotAllowedError'))).toMatch(/permission was denied/);
    expect(cameraErrorMessage(err('NotFoundError'))).toMatch(/No camera found/);
    expect(cameraErrorMessage(err('NotReadableError'))).toMatch(/in use/);
    expect(cameraErrorMessage(new Error('x'))).toMatch(/Could not start the camera/);
    expect(cameraErrorMessage('boom')).toMatch(/Could not start the camera/);
  });
});
