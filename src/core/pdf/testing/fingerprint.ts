import { createHash } from 'node:crypto';

/**
 * Short one-way fingerprint of the first `length` characters of a text.
 * Real-exam tests compare these instead of quoting exam wording, so no copyrighted
 * question or explanation text lives in this repository.
 */
export function fingerprint(text: string, length = 30): string {
  return createHash('sha256').update(text.slice(0, length)).digest('hex').slice(0, 16);
}
