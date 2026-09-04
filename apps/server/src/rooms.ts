import { randomUUID } from 'node:crypto';
import type {
  AnyGameModule,
  GameContext,
  Player,
  PlayerId,
  RoomCode,
  RoomSnapshot,
  RoomStatus,
} from '@arcade/core';

/** No I/O/0/1 - room codes get shouted across a room and read off a projector. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

export const MAX_PLAYERS = 500;
export const MAX_NAME_LENGTH = 20;
/** How long a room survives with no host socket attached. */
const HOST_GRACE_MS = 2 * 60 * 1_000;
/** How long an idle room lingers before it is reaped. */
const ROOM_TTL_MS = 3 * 60 * 60 * 1_000;

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f\\u007f]', 'g');

interface RoomPlayer extends Player {
  socketId: string | null;
}

export interface Room {
  code: RoomCode;
  gameId: string;
  game: AnyGameModule;
  config: unknown;
  status: RoomStatus;
  hostSocketId: string | null;
  hostLeftAt: number | null;
  players: Map<PlayerId, RoomPlayer>;
  state: { version: number } | null;
  createdAt: number;
  /** Set when the roster changed; the tick loop flushes it, so a join storm costs one broadcast. */
  snapshotDirty: boolean;
  /** Views already delivered, so we only emit when something actually changed. */
  lastHostView: string;
  lastPlayerViews: Map<PlayerId, string>;
}

export function sanitizeName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  return text.replace(CONTROL_CHARS, '').trim().slice(0, MAX_NAME_LENGTH);
}

export class RoomStore {
  private readonly rooms = new Map<RoomCode, Room>();

  create(game: AnyGameModule, config: unknown, hostSocketId: string): Room {
    const room: Room = {
      code: this.nextCode(),
      gameId: game.id,
      game,
      config,
      status: 'lobby',
      hostSocketId,
      hostLeftAt: null,
      players: new Map(),
      state: null,
      createdAt: Date.now(),
      snapshotDirty: false,
      lastHostView: '',
      lastPlayerViews: new Map(),
    };
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: RoomCode): Room | undefined {
    return typeof code === 'string' ? this.rooms.get(code.toUpperCase()) : undefined;
  }

  byHostSocket(socketId: string): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.hostSocketId === socketId) return room;
    }
    return undefined;
  }

  all(): Room[] {
    return [...this.rooms.values()];
  }

  delete(code: RoomCode): void {
    this.rooms.delete(code);
  }

  /** Rooms whose host never came back, plus anything left running overnight. */
  expired(now: number): Room[] {
    return this.all().filter(
      (room) =>
        (room.hostLeftAt !== null && now - room.hostLeftAt > HOST_GRACE_MS) ||
        now - room.createdAt > ROOM_TTL_MS,
    );
  }

  private nextCode(): RoomCode {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i += 1) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    // Astronomically unlikely; fall back to something guaranteed unique.
    return randomUUID().slice(0, 8).toUpperCase();
  }
}

export function addPlayer(room: Room, name: string): RoomPlayer {
  const player: RoomPlayer = {
    id: randomUUID(),
    name: uniqueName(room, name),
    connected: true,
    joinedAt: Date.now(),
    socketId: null,
  };
  room.players.set(player.id, player);
  return player;
}

/** Two people called "Sam" make an unreadable leaderboard. */
function uniqueName(room: Room, name: string): string {
  const taken = new Set([...room.players.values()].map((player) => player.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const candidate = `${name} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return name;
}

export function contextFor(room: Room, now: number): GameContext {
  return { now, players: publicPlayers(room) };
}

export function snapshot(room: Room): RoomSnapshot {
  return {
    code: room.code,
    gameId: room.gameId,
    status: room.status,
    playerCount: room.players.size,
    players: publicPlayers(room),
  };
}

/** The same snapshot without the roster - what each player client receives. */
export function playerSnapshot(room: Room, playerId: PlayerId): RoomSnapshot {
  const self = room.players.get(playerId);
  return {
    code: room.code,
    gameId: room.gameId,
    status: room.status,
    playerCount: room.players.size,
    players: self ? [{ id: self.id, name: self.name, connected: self.connected, joinedAt: self.joinedAt }] : [],
  };
}

function publicPlayers(room: Room): Player[] {
  return [...room.players.values()].map(({ id, name, connected, joinedAt }) => ({
    id,
    name,
    connected,
    joinedAt,
  }));
}

export function connectedPlayerSockets(room: Room): Array<[PlayerId, string]> {
  const pairs: Array<[PlayerId, string]> = [];
  for (const player of room.players.values()) {
    if (player.socketId) pairs.push([player.id, player.socketId]);
  }
  return pairs;
}

export type { RoomPlayer };
