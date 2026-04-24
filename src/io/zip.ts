import { zipSync, unzipSync } from 'fflate';

/**
 * Synchronous ZIP build over an in-memory file map. We use fflate because
 * the entire export is a few MB at most and streaming is not worth the
 * complexity for v1.
 */
export function buildZip(files: Record<string, Uint8Array>): Uint8Array {
  const input: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) input[name] = bytes;
  return zipSync(input, { level: 6 });
}

export function parseZip(bytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(bytes);
}
