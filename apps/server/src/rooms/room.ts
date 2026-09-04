import {
  accumulate,
  clampRoundCount,
  createMatchId,
  createPlayerId,
  createSessionToken,
  type LeaderboardEntry,
  type MatchId,
  type MatchSnapshot,
  type Participant,
  type PlayerId,
  type Role,
  type RoomCode,
  type RoomSnapshot,
  type RoundScore,
  type RoundWindow,
  type RoomStatus,
} from '@arcade/core';
import {
  DEFAULT_ROUND_COUNT,
  GAME_ID,
  ROUND_DURATION_MS,
  allBoardsFinished,
  createBoard,
  createRound,
  publicBoard,
  randomAnswer,
  resolveRound,
  type CipherRoundState,
  type PublicBoard,
} from '@arcade/cipher';

export interface ParticipantRuntime {
  participant: Participant;
  /** Bearer token proving ownership of the PlayerId across reconnects. */
  token: string;
  socketId: string | null;
  disconnectedAt: number | null;
}

/** How long a dropped player keeps their seat and score before being cleared. */
export const DISCONNECT_GRACE_MS = 90_000;

export type RoundEndReason = 'all_finished' | 'time_up' | 'facilitator';

export class RoomRuntime {
  readonly code: RoomCode;
  readonly matchId: MatchId = createMatchId();
  readonly createdAt = Date.now();

  status: RoomStatus = 'lobby';
  roundCount: number;
  currentRoundIndex = -1;
  round: CipherRoundState | null = null;
  /** Set by the facilitator before the round starts. Never leaves the server. */
  pendingSecret: string | null = null;

  readonly participants = new Map<PlayerId, ParticipantRuntime>();
  readonly scores: RoundScore[] = [];
  readonly windows: RoundWindow[] = [];

  timer: NodeJS.Timeout | null = null;
  lastActivityAt = Date.now();

  constructor(code: RoomCode, roundCount: number = DEFAULT_ROUND_COUNT) {
    this.code = code;
    this.roundCount = clampRoundCount(roundCount);
    for (let i = 0; i < this.roundCount; i += 1) {
      this.windows.push({ index: i, startedAt: 0, endsAt: 0, phase: 'pending' });
    }
  }

  // ---- participants -------------------------------------------------------

  add(displayName: string, role: Role): ParticipantRuntime {
    const id = createPlayerId();
    const runtime: ParticipantRuntime = {
      participant: {
        id,
        role,
        displayName: this.uniqueName(displayName),
        connected: true,
        joinedAt: Date.now(),
        // Someone joining mid-round watches it out and scores from the next one.
        eligibleFromRound: this.status === 'in_round' ? this.currentRoundIndex + 1 : Math.max(0, this.currentRoundIndex),
      },
      token: createSessionToken(),
      socketId: null,
      disconnectedAt: null,
    };
    this.participants.set(id, runtime);
    this.touch();
    return runtime;
  }

  /** Keeps the leaderboard readable when three people are all called "Sam". */
  private uniqueName(requested: string): string {
    const base = requested.trim().slice(0, 24) || 'Player';
    const taken = new Set([...this.participants.values()].map((p) => p.participant.displayName));
    if (!taken.has(base)) return base;
    for (let n = 2; n < 500; n += 1) {
      const candidate = `${base} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
    return base;
  }

  authenticate(playerId: PlayerId, token: string): ParticipantRuntime | null {
    const runtime = this.participants.get(playerId);
    if (runtime === undefined || runtime.token !== token) return null;
    return runtime;
  }

  facilitator(): ParticipantRuntime | undefined {
    for (const runtime of this.participants.values()) {
      if (runtime.participant.role === 'facilitator') return runtime;
    }
    return undefined;
  }

  /** Connected players eligible for the current round. */
  activePlayers(): PlayerId[] {
    const out: PlayerId[] = [];
    for (const runtime of this.participants.values()) {
      const p = runtime.participant;
      if (p.role === 'player' && p.connected && p.eligibleFromRound <= this.currentRoundIndex) {
        out.push(p.id);
      }
    }
    return out;
  }

  markDisconnected(playerId: PlayerId): void {
    const runtime = this.participants.get(playerId);
    if (runtime === undefined) return;
    runtime.participant.connected = false;
    runtime.socketId = null;
    runtime.disconnectedAt = Date.now();
    this.touch();
  }

  /** Drops players who never came back, so the wall and leaderboard stay honest. */
  sweepDisconnected(now = Date.now()): PlayerId[] {
    const removed: PlayerId[] = [];
    for (const [id, runtime] of this.participants) {
      if (
        !runtime.participant.connected &&
        runtime.disconnectedAt !== null &&
        now - runtime.disconnectedAt > DISCONNECT_GRACE_MS &&
        runtime.participant.role === 'player'
      ) {
        this.participants.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }

  hasAnyoneConnected(): boolean {
    for (const runtime of this.participants.values()) {
      if (runtime.participant.connected) return true;
    }
    return false;
  }

  touch(): void {
    this.lastActivityAt = Date.now();
  }

  // ---- rounds -------------------------------------------------------------

  canStartRound(): boolean {
    return (
      (this.status === 'lobby' || this.status === 'round_review') &&
      this.currentRoundIndex + 1 < this.roundCount &&
      this.pendingSecret !== null
    );
  }

  startRound(now = Date.now()): CipherRoundState {
    const index = this.currentRoundIndex + 1;
    const secret = this.pendingSecret ?? randomAnswer();
    const round = createRound(index, secret, now);

    for (const runtime of this.participants.values()) {
      const p = runtime.participant;
      if (p.role !== 'player') continue;
      if (p.eligibleFromRound > index) continue;
      round.boards.set(p.id, createBoard(p.id));
    }

    this.round = round;
    this.currentRoundIndex = index;
    this.status = 'in_round';
    this.pendingSecret = null;

    const window = this.windows[index];
    if (window !== undefined) {
      window.startedAt = now;
      window.endsAt = now + ROUND_DURATION_MS;
      window.phase = 'active';
    }

    this.touch();
    return round;
  }

  /** True once every eligible connected player has solved or run out of guesses. */
  shouldEndEarly(): boolean {
    if (this.round === null || this.round.phase !== 'active') return false;
    return allBoardsFinished(this.round, this.activePlayers());
  }

  endRound(): { scores: RoundScore[]; secret: string; solvedBy: PlayerId[] } | null {
    const round = this.round;
    if (round === null || round.phase === 'resolved') return null;

    const scores = resolveRound(round);
    this.scores.push(...scores);
    this.status = this.currentRoundIndex + 1 >= this.roundCount ? 'match_complete' : 'round_review';

    const window = this.windows[round.index];
    if (window !== undefined) window.phase = 'resolved';

    const solvedBy: PlayerId[] = [];
    for (const board of round.boards.values()) {
      if (board.solved) solvedBy.push(board.playerId);
    }

    this.clearTimer();
    this.touch();
    return { scores, secret: round.secret, solvedBy };
  }

  clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ---- projections --------------------------------------------------------

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      gameId: GAME_ID,
      status: this.status,
      config: { gameId: GAME_ID, roundCount: this.roundCount },
      participants: [...this.participants.values()].map((r) => ({ ...r.participant })),
      currentRoundIndex: this.currentRoundIndex,
    };
  }

  matchSnapshot(): MatchSnapshot {
    return {
      matchId: this.matchId,
      roundCount: this.roundCount,
      currentRoundIndex: this.currentRoundIndex,
      rounds: this.windows.map((w) => ({ ...w })),
    };
  }

  leaderboard(): LeaderboardEntry[] {
    const names = new Map<PlayerId, string>();
    for (const runtime of this.participants.values()) {
      if (runtime.participant.role === 'player') {
        names.set(runtime.participant.id, runtime.participant.displayName);
      }
    }
    return accumulate(this.scores, names, this.roundCount);
  }

  progress(): PublicBoard[] {
    if (this.round === null) return [];
    return [...this.round.boards.values()].map(publicBoard);
  }
}
