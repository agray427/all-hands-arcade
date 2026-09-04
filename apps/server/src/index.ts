import { createServer } from 'node:http';

import { GAME_NAME } from '@arcade/cipher';
import { Server } from 'socket.io';

import { env } from './env.js';
import { registerCipher } from './games/cipher/handlers.js';
import type { ArcadeServer } from './io.js';
import { Broadcaster } from './rooms/broadcast.js';
import { RoomRegistry } from './rooms/registry.js';

const http = createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, game: GAME_NAME }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io: ArcadeServer = new Server(http, {
  cors: { origin: env.clientOrigins, methods: ['GET', 'POST'] },
  // Rides out brief network blips without a full rejoin; an explicit
  // room:resume is still the authoritative path for a refresh.
  connectionStateRecovery: { maxDisconnectionDuration: 30_000 },
});

const registry = new RoomRegistry();
const broadcaster = new Broadcaster(io, registry);

registerCipher(io, registry, broadcaster);
broadcaster.start();
registry.startSweeper((room) => {
  io.to(`room:${room.code}`).emit('room:closed', 'This game was idle and has been closed');
});

http.listen(env.port, () => {
  console.log(`[arcade] ${GAME_NAME} server on :${env.port}`);
  console.log(`[arcade] accepting origins: ${env.clientOrigins.join(', ')}`);
});

function shutdown(signal: string): void {
  console.log(`[arcade] ${signal} received, shutting down`);
  broadcaster.stop();
  registry.stop();
  io.close(() => http.close(() => process.exit(0)));
  setTimeout(() => process.exit(0), 5_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
