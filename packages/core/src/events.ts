import type { Ack } from './errors.js';
import type { LeaderboardEntry } from './leaderboard.js';
import type { MatchSnapshot, RoundWindow } from './match.js';
import type { PlayerId, RoomCode } from './ids.js';
import type { Participant, RoomSnapshot, Role } from './room.js';

/**
 * Server-issued proof of identity. The client persists this in localStorage so
 * a refresh or a dropped connection resumes the same board and score instead
 * of seating a duplicate player.
 */
export interface Identity {
  playerId: PlayerId;
  token: string;
}

export interface CreateRoomRequest {
  displayName: string;
  gameId: string;
  roundCount: number;
}

export interface JoinRoomRequest {
  code: string;
  displayName: string;
}

export interface ResumeRequest {
  code: string;
  identity: Identity;
}

export interface SessionResult {
  code: RoomCode;
  role: Role;
  identity: Identity;
  snapshot: RoomSnapshot;
  match: MatchSnapshot | null;
  leaderboard: LeaderboardEntry[];
  /**
   * Opaque to the platform layer; the game's client code narrows it. Keeps
   * core game-agnostic without threading generics through every event.
   */
  gameState: unknown;
}

export interface RoundResolvedPayload {
  index: number;
  leaderboard: LeaderboardEntry[];
  /** True when this was the final round. */
  matchComplete: boolean;
}

export interface ArcadeClientToServer {
  'room:create': (req: CreateRoomRequest, ack: Ack<SessionResult>) => void;
  'room:join': (req: JoinRoomRequest, ack: Ack<SessionResult>) => void;
  'room:resume': (req: ResumeRequest, ack: Ack<SessionResult>) => void;
  'room:leave': (ack: Ack<null>) => void;
  'match:start': (ack: Ack<null>) => void;
  'round:advance': (ack: Ack<null>) => void;
  'time:sync': (clientSentAt: number, ack: (serverNow: number) => void) => void;
}

export interface ArcadeServerToClient {
  'room:snapshot': (snapshot: RoomSnapshot) => void;
  'room:participant': (participant: Participant) => void;
  'match:state': (match: MatchSnapshot) => void;
  'round:started': (window: RoundWindow) => void;
  'round:resolved': (payload: RoundResolvedPayload) => void;
  'leaderboard:update': (leaderboard: LeaderboardEntry[]) => void;
  'room:closed': (reason: string) => void;
  'arcade:error': (error: { code: string; message: string }) => void;
}

/** Per-socket server-side context, attached by the connection handler. */
export interface ArcadeSocketData {
  roomCode?: RoomCode;
  playerId?: PlayerId;
  role?: Role;
}
