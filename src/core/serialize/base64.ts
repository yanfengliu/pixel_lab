/**
 * Cross-runtime base64 helpers. Under Node (vitest), Buffer is available.
 * In the browser, we use the global btoa/atob path via 4 KiB chunks — any
 * larger and some engines (notably older Safari) throw "Maximum call stack
 * size exceeded" when spreading the chunk into String.fromCharCode.apply.
 */

const CHUNK = 4096;

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64');
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)) as number[],
    );
  }
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
