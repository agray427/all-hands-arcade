/** Stable identifier handed to a player when they join; survives reconnects. */
export type PlayerId = string;

/** Short, human-shoutable room code (e.g. "QF7K"). */
export type RoomCode = string;

export interface Player {
  id: PlayerId;
  name: string;
  connected: boolean;
  joinedAt: number;
}

export interface ScoreEntry {
  playerId: PlayerId;
  name: string;
  score: number;
  /** 1-based, competition ranking (ties share a rank). */
  rank: number;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended';

/** Everything the host dashboard needs before the game itself takes over. */
export interface RoomSnapshot {
  code: RoomCode;
  gameId: string;
  status: RoomStatus;
  playerCount: number;
  /**
   * The full roster for the host. Player clients receive only their own entry,
   * so a 300-person lobby doesn't ship 300 rosters to 300 phones.
   */
  players: Player[];
}
