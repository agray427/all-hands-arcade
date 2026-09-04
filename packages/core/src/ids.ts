/**
 * Branded identifier types and the join-code alphabet.
 *
 * Everything here must run unchanged in Node and in the browser, so we use
 * the global WebCrypto API (see globals.d.ts) rather than importing
 * `node:crypto`, which would break the client bundle.
 */

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

export type RoomCode = Brand<string, 'RoomCode'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type MatchId = Brand<string, 'MatchId'>;

/** Crockford-ish: no I, O, 0 or 1, so codes read aloud without ambiguity. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 4;

function randomInt(bound: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // Modulo bias across 2^32 vs a 32-symbol alphabet is nil; codes are not secrets.
  return (buf[0] ?? 0) % bound;
}

export function createJoinCode(length: number = JOIN_CODE_LENGTH): RoomCode {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += JOIN_CODE_ALPHABET.charAt(randomInt(JOIN_CODE_ALPHABET.length));
  }
  return out as RoomCode;
}

/** Uppercase and drop anything outside the alphabet, so "abc-d" -> "ABCD". */
export function normalizeJoinCode(raw: string): RoomCode {
  let out = '';
  for (const ch of raw.toUpperCase()) {
    if (JOIN_CODE_ALPHABET.includes(ch)) out += ch;
  }
  return out as RoomCode;
}

export function isJoinCodeShaped(raw: string): boolean {
  return normalizeJoinCode(raw).length === JOIN_CODE_LENGTH;
}

export function createId(): string {
  return crypto.randomUUID();
}

export function createPlayerId(): PlayerId {
  return createId() as PlayerId;
}

export function createMatchId(): MatchId {
  return createId() as MatchId;
}

/** Bearer token proving a client owns a PlayerId across reconnects. */
export function createSessionToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}
