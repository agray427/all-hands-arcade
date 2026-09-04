import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@arcade/core';

export type ArcadeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export function connect(): ArcadeSocket {
  return io(SERVER_URL, { transports: ['websocket', 'polling'] });
}
