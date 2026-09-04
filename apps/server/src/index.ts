import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@arcade/core';
import { ClientEvent, ServerEvent } from '@arcade/core';
import { getGame, listGames } from './games.js';
import {
  addPlayer,
  connectedPlayerSockets,
  contextFor,
  MAX_PLAYERS,
  playerSnapshot,
  RoomStore,
  sanitizeName,
  snapshot,
} from './rooms.js';
import type { Room } from './rooms.js';

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
/** How often phases advance and pending broadcasts flush. */
const TICK_MS = 250;

interface SocketData {
  role: 'host' | 'player' | null;
  roomCode: string | null;
  playerId: string | null;
}

const rooms = new RoomStore();

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.all().length }));
    return;
  }
  if (req.url === '/games') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(listGames()));
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('All Hands Arcade server');
});

const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  {
    cors: {
      origin: CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
      methods: ['GET', 'POST'],
    },
  },
);

const playersRoom = (code: string): string => `players:${code}`;

/** Queue a roster broadcast; the tick loop coalesces bursts of joins into one. */
function markSnapshotDirty(room: Room): void {
  room.snapshotDirty = true;
}

function flushSnapshot(room: Room): void {
  room.snapshotDirty = false;
  if (room.hostSocketId) {
    io.to(room.hostSocketId).emit(ServerEvent.Room, snapshot(room));
  }
  // Players each get a snapshot naming only themselves, so this stays cheap.
  for (const [playerId, socketId] of connectedPlayerSockets(room)) {
    io.to(socketId).emit(ServerEvent.Room, playerSnapshot(room, playerId));
  }
}

/** Push host and player views, skipping anyone whose view hasn't changed. */
function broadcastViews(room: Room): void {
  if (!room.state) return;
  const ctx = contextFor(room, Date.now());

  if (room.hostSocketId) {
    const view = JSON.stringify(room.game.hostView(room.state, ctx));
    if (view !== room.lastHostView) {
      room.lastHostView = view;
      io.to(room.hostSocketId).emit(ServerEvent.HostView, JSON.parse(view));
    }
  }

  for (const [playerId, socketId] of connectedPlayerSockets(room)) {
    const view = JSON.stringify(room.game.playerView(room.state, playerId, ctx));
    if (room.lastPlayerViews.get(playerId) === view) continue;
    room.lastPlayerViews.set(playerId, view);
    io.to(socketId).emit(ServerEvent.PlayerView, JSON.parse(view));
  }
}

function closeRoom(room: Room, reason: string): void {
  io.to(playersRoom(room.code)).emit(ServerEvent.Closed, { reason });
  if (room.hostSocketId) io.to(room.hostSocketId).emit(ServerEvent.Closed, { reason });
  rooms.delete(room.code);
}

setInterval(() => {
  const now = Date.now();

  for (const room of rooms.all()) {
    if (room.status === 'playing' && room.state) {
      const ctx = contextFor(room, now);
      const next = room.game.tick(room.state, ctx);
      if (next.version !== room.state.version) {
        room.state = next;
        if (room.game.isOver(next)) {
          room.status = 'ended';
          markSnapshotDirty(room);
        }
      }
      broadcastViews(room);
    }
    if (room.snapshotDirty) flushSnapshot(room);
  }

  for (const room of rooms.expired(now)) {
    closeRoom(room, 'The host left and the room timed out.');
  }
}, TICK_MS);

io.on('connection', (socket) => {
  socket.data.role = null;
  socket.data.roomCode = null;
  socket.data.playerId = null;

  socket.on(ClientEvent.HostCreate, (payload, ack) => {
    const game = getGame(String(payload?.gameId ?? ''));
    if (!game) {
      ack({ ok: false, error: `Unknown game "${payload?.gameId}".` });
      return;
    }

    const room = rooms.create(game, game.parseConfig(payload.config), socket.id);
    socket.data.role = 'host';
    socket.data.roomCode = room.code;
    ack({ ok: true, room: snapshot(room) });
  });

  socket.on(ClientEvent.HostStart, (ack) => {
    const room = rooms.byHostSocket(socket.id);
    if (!room) {
      ack({ ok: false, error: 'You are not hosting a room.' });
      return;
    }
    if (room.status !== 'lobby') {
      ack({ ok: false, error: 'This game has already started.' });
      return;
    }
    if (room.players.size < room.game.minPlayers) {
      ack({
        ok: false,
        error: `${room.game.name} needs at least ${room.game.minPlayers} players.`,
      });
      return;
    }

    room.status = 'playing';
    room.state = room.game.create(room.config as never, contextFor(room, Date.now()));
    markSnapshotDirty(room);
    broadcastViews(room);
    ack({ ok: true });
  });

  socket.on(ClientEvent.HostEnd, (ack) => {
    const room = rooms.byHostSocket(socket.id);
    if (!room) {
      ack({ ok: false, error: 'You are not hosting a room.' });
      return;
    }
    closeRoom(room, 'The host ended the game.');
    ack({ ok: true });
  });

  socket.on(ClientEvent.PlayerJoin, (payload, ack) => {
    const room = rooms.get(String(payload?.roomCode ?? ''));
    if (!room) {
      ack({ ok: false, error: 'No room with that code. Check the screen and try again.' });
      return;
    }
    // A refreshed tab reclaims its seat (and its score) with the id it was given -
    // including after the last round, so a reconnect still sees the final scores.
    const existing = payload.playerId ? room.players.get(payload.playerId) : undefined;
    let player = existing;

    if (!player) {
      if (room.status === 'ended') {
        ack({ ok: false, error: 'That game has already finished.' });
        return;
      }
      if (room.players.size >= MAX_PLAYERS) {
        ack({ ok: false, error: 'This room is full.' });
        return;
      }
      const name = sanitizeName(payload?.name);
      if (!name) {
        ack({ ok: false, error: 'Pick a name first.' });
        return;
      }
      player = addPlayer(room, name);
    }

    player.socketId = socket.id;
    player.connected = true;
    socket.data.role = 'player';
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    void socket.join(playersRoom(room.code));

    // Force this player's next view through, whatever the diff cache says.
    room.lastPlayerViews.delete(player.id);
    markSnapshotDirty(room);
    ack({ ok: true, playerId: player.id, name: player.name, room: playerSnapshot(room, player.id) });
    broadcastViews(room);
  });

  socket.on(ClientEvent.PlayerAction, (payload) => {
    const { roomCode, playerId } = socket.data;
    if (!roomCode || !playerId) return;
    const room = rooms.get(roomCode);
    if (!room || room.status !== 'playing' || !room.state) return;

    const next = room.game.submit(room.state, playerId, payload?.action, contextFor(room, Date.now()));
    if (next.version === room.state.version) return;
    room.state = next;
    broadcastViews(room);
  });

  socket.on('disconnect', () => {
    const { role, roomCode, playerId } = socket.data;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;

    if (role === 'host' && room.hostSocketId === socket.id) {
      // Give the host a couple of minutes to come back before reaping the room.
      room.hostSocketId = null;
      room.hostLeftAt = Date.now();
      return;
    }

    if (role === 'player' && playerId) {
      const player = room.players.get(playerId);
      if (player && player.socketId === socket.id) {
        player.socketId = null;
        player.connected = false;
        markSnapshotDirty(room);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  const names = listGames()
    .map((game) => game.id)
    .join(', ');
  console.log(`[arcade] listening on :${PORT} (origin ${CLIENT_ORIGIN}) - games: ${names}`);
});
