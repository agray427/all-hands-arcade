import type { ArcadeError, Result } from '@arcade/core';
import type { CipherC2S, CipherS2C } from '@arcade/cipher';
import { io, type Socket } from 'socket.io-client';

/**
 * Note the generic order: socket.io-client is <ListenEvents, EmitEvents>,
 * the mirror image of the server's <Listen=C2S, Emit=S2C>. Getting this
 * backwards type-checks fine and then fails at runtime, so it is spelled out.
 */
export type ArcadeClientSocket = Socket<CipherS2C, CipherC2S>;

const SERVER_URL = import.meta.env['VITE_SERVER_URL'] ?? 'http://localhost:3001';

export function createSocket(): ArcadeClientSocket {
  return io(SERVER_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
  });
}

export class RequestError extends Error {
  constructor(readonly detail: ArcadeError) {
    super(detail.message);
    this.name = 'RequestError';
  }
}

const TIMEOUT_MS = 10_000;

/**
 * Turns socket.io's ack callbacks into promises so route code can `await` a
 * server answer and catch a typed failure, instead of correlating a broadcast.
 */
export function request<TData>(
  socket: ArcadeClientSocket,
  event: string,
  ...args: unknown[]
): Promise<TData> {
  return new Promise<TData>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RequestError({ code: 'bad_request', message: 'The server did not respond' }));
    }, TIMEOUT_MS);

    const ack = (result: Result<TData>): void => {
      clearTimeout(timer);
      if (result?.ok) resolve(result.data);
      else {
        reject(
          new RequestError(
            result?.error ?? { code: 'bad_request', message: 'Something went wrong' },
          ),
        );
      }
    };

    // Cast: the promise wrapper is deliberately generic over the typed contract.
    (socket.emit as (ev: string, ...a: unknown[]) => void)(event, ...args, ack);
  });
}
