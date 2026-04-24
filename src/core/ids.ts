import type { Id } from './types';

const cryptoRef: { randomUUID?: () => string } | undefined =
  typeof globalThis !== 'undefined' && typeof globalThis.crypto !== 'undefined'
    ? (globalThis.crypto as { randomUUID?: () => string })
    : undefined;

export function newId(): Id {
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  const buf = new Uint8Array(16);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  buf[6] = (buf[6]! & 0x0f) | 0x40;
  buf[8] = (buf[8]! & 0x3f) | 0x80;
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
