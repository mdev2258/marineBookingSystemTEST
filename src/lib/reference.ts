import { randomInt } from 'node:crypto';

// Crockford-ish: no I, O, U, 0, 1 -- these are read aloud over a VHF radio and
// written on a whiteboard in the rain.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTVWXYZ';

function code(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** HS-7QK2ND */
export function generateBookingReference(prefix = 'HS'): string {
  return `${prefix}-${code(6)}`;
}

/** Single-use, unguessable, and short enough to survive an email client. */
export function generateRebookToken(): string {
  return code(24).toLowerCase();
}
