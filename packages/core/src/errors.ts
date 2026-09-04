export type ArcadeErrorCode =
  | 'room_not_found'
  | 'room_full'
  | 'not_facilitator'
  | 'invalid_state'
  | 'invalid_entry'
  | 'rate_limited'
  | 'name_taken'
  | 'unauthorized'
  | 'bad_request';

export interface ArcadeError {
  code: ArcadeErrorCode;
  message: string;
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: ArcadeError };

/**
 * Request/response flows use socket.io ack callbacks rather than error events,
 * so the caller can await a specific answer instead of correlating a stray
 * broadcast.
 */
export type Ack<T> = (result: Result<T>) => void;

export function fail(code: ArcadeErrorCode, message: string): { ok: false; error: ArcadeError } {
  return { ok: false, error: { code, message } };
}

export function succeed<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}
