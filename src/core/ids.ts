import type { Id } from './types';

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(view: T) => T;
};

const cryptoRef: CryptoLike | undefined =
  typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined'
    ? (globalThis.crypto as CryptoLike)
    : undefined;

export function newId(): Id {
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();

  const buf = new Uint8Array(16);
  if (cryptoRef?.getRandomValues) {
    cryptoRef.getRandomValues(buf);
  } else {
    // Non-secure fallback for environments missing Web Crypto entirely
    // (very old Node, some embedded runtimes). Collision rate is higher;
    // caller IDs are local and ephemeral so this is acceptable, but we
    // prefer the crypto path above whenever it exists.
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  buf[6] = (buf[6]! & 0x0f) | 0x40;
  buf[8] = (buf[8]! & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
