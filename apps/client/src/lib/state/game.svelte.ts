import type {
  Identity,
  LeaderboardEntry,
  SessionResult,
  MatchSnapshot,
  Participant,
  Role,
  RoomSnapshot,
  RoundWindow,
} from '@arcade/core';
import {
  MAX_GUESSES,
  NOT_ALLOWED_MESSAGE,
  WORD_LENGTH,
  mergeKeyboardStates,
  validateEntry,
  type CipherSessionState,
  type GuessAccepted,
  type LetterState,
  type PublicBoard,
  type SelfBoard,
} from '@arcade/cipher';

import { RequestError, createSocket, request, type ArcadeClientSocket } from '../socket.js';
import { loadIdentity, saveIdentity } from './session.svelte.js';

export type Connection = 'idle' | 'connecting' | 'online' | 'offline';

export interface RevealInfo {
  index: number;
  secret: string;
  solvedCount: number;
}

/**
 * One store for both roles. Cipher is a single game with a facilitator view and
 * a player view of the same room, so splitting them would mean duplicating
 * every listener for no benefit.
 */
export class GameStore {
  readonly socket: ArcadeClientSocket = createSocket();

  connection = $state<Connection>('idle');
  fatal = $state<string | null>(null);

  code = $state('');
  role = $state<Role>('player');
  identity = $state<Identity | null>(null);

  snapshot = $state<RoomSnapshot | null>(null);
  match = $state<MatchSnapshot | null>(null);
  leaderboard = $state<LeaderboardEntry[]>([]);
  window = $state<RoundWindow | null>(null);

  /** Player view. */
  guesses = $state<string[]>([]);
  results = $state<LetterState[][]>([]);
  draft = $state('');
  solved = $state(false);
  roundPoints = $state<number | null>(null);
  error = $state<string | null>(null);
  shakeToken = $state(0);
  revealToken = $state(0);
  submitting = $state(false);

  /** Facilitator view. */
  secret = $state<string | null>(null);
  progress = $state<PublicBoard[]>([]);
  hasSecret = $state(false);

  reveal = $state<RevealInfo | null>(null);
  matchComplete = $state(false);

  /** Server clock minus ours, from a half-RTT sample. */
  clockSkew = $state(0);
  now = $state(Date.now());

  #ticker: ReturnType<typeof setInterval> | null = null;
  #syncer: ReturnType<typeof setInterval> | null = null;

  // ---- derived ------------------------------------------------------------

  get isFacilitator(): boolean {
    return this.role === 'facilitator';
  }

  get participants(): Participant[] {
    return this.snapshot?.participants ?? [];
  }

  get playerCount(): number {
    return this.participants.filter((p) => p.role === 'player').length;
  }

  get connectedPlayerCount(): number {
    return this.participants.filter((p) => p.role === 'player' && p.connected).length;
  }

  get roundCount(): number {
    return this.snapshot?.config.roundCount ?? 0;
  }

  get roundIndex(): number {
    return this.snapshot?.currentRoundIndex ?? -1;
  }

  get status(): RoomSnapshot['status'] {
    return this.snapshot?.status ?? 'lobby';
  }

  get inRound(): boolean {
    return this.status === 'in_round';
  }

  /** Countdown from the round's server-side end time, corrected for skew. */
  get msRemaining(): number {
    const endsAt = this.window?.endsAt ?? 0;
    if (endsAt === 0 || !this.inRound) return 0;
    return Math.max(0, endsAt - (this.now + this.clockSkew));
  }

  get secondsRemaining(): number {
    return Math.ceil(this.msRemaining / 1000);
  }

  get outOfGuesses(): boolean {
    return this.guesses.length >= MAX_GUESSES;
  }

  get finished(): boolean {
    return this.solved || this.outOfGuesses;
  }

  get canType(): boolean {
    return this.inRound && !this.finished && this.msRemaining > 0;
  }

  get keyboard(): Map<string, LetterState> {
    let states = new Map<string, LetterState>();
    for (let i = 0; i < this.guesses.length; i += 1) {
      const guess = this.guesses[i];
      const result = this.results[i];
      if (guess === undefined || result === undefined) continue;
      states = mergeKeyboardStates(states, guess, result);
    }
    return states;
  }

  /** The five rows: submitted, then the row being typed, then blanks. */
  get rows(): { letters: string[]; states: LetterState[] | null; active: boolean }[] {
    const rows: { letters: string[]; states: LetterState[] | null; active: boolean }[] = [];
    for (let i = 0; i < MAX_GUESSES; i += 1) {
      const guess = this.guesses[i];
      if (guess !== undefined) {
        rows.push({ letters: [...guess], states: this.results[i] ?? null, active: false });
        continue;
      }
      const isDraftRow = i === this.guesses.length && this.canType;
      const letters = isDraftRow ? [...this.draft] : [];
      while (letters.length < WORD_LENGTH) letters.push('');
      rows.push({ letters, states: null, active: isDraftRow });
    }
    return rows;
  }

  // ---- lifecycle ----------------------------------------------------------

  connect(): void {
    if (this.connection !== 'idle') return;
    this.connection = 'connecting';
    this.#bind();
    this.socket.connect();

    this.#ticker = setInterval(() => {
      this.now = Date.now();
    }, 200);
    this.#syncer = setInterval(() => void this.#syncClock(), 20_000);
  }

  destroy(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    if (this.#syncer !== null) clearInterval(this.#syncer);
    this.#ticker = null;
    this.#syncer = null;
    this.socket.removeAllListeners();
    this.socket.close();
    this.connection = 'idle';
  }

  async #syncClock(): Promise<void> {
    const sentAt = Date.now();
    this.socket.emit('time:sync', sentAt, (serverNow: number) => {
      const receivedAt = Date.now();
      this.clockSkew = serverNow + (receivedAt - sentAt) / 2 - receivedAt;
    });
  }

  #bind(): void {
    const s = this.socket;

    s.on('connect', () => {
      this.connection = 'online';
      void this.#syncClock();
      // A reconnect after a drop: reclaim the same seat and board.
      if (this.identity !== null && this.code !== '') void this.#resume();
    });
    s.on('disconnect', () => {
      this.connection = 'offline';
    });

    s.on('room:snapshot', (snapshot) => {
      this.snapshot = snapshot;
      if (snapshot.status !== 'in_round') this.hasSecret = this.secret !== null;
    });
    s.on('room:participant', () => {
      /* snapshot follows; this event exists for future incremental UIs */
    });
    s.on('match:state', (match) => {
      this.match = match;
      const current = match.rounds[match.currentRoundIndex];
      if (current !== undefined) this.window = current;
    });
    s.on('round:started', (window) => {
      this.window = window;
      this.#resetBoard();
      this.reveal = null;
      this.hasSecret = true;
    });
    s.on('round:resolved', (payload) => {
      this.leaderboard = payload.leaderboard;
      this.matchComplete = payload.matchComplete;
      this.secret = null;
      this.hasSecret = false;
    });
    s.on('leaderboard:update', (leaderboard) => {
      this.leaderboard = leaderboard;
    });
    s.on('room:closed', (reason) => {
      this.fatal = reason;
    });
    s.on('arcade:error', (error) => {
      this.error = error.message;
    });

    s.on('cipher:board', (board: SelfBoard) => this.#applyBoard(board));
    s.on('cipher:progress', (boards) => {
      this.progress = boards;
    });
    s.on('cipher:secretReady', ({ hasSecret }) => {
      this.hasSecret = hasSecret;
    });
    s.on('cipher:reveal', ({ index, secret, solvedBy }) => {
      this.reveal = { index, secret, solvedCount: solvedBy.length };
    });
  }

  #applyBoard(board: SelfBoard): void {
    this.guesses = [...board.guesses];
    this.results = board.results.map((row) => [...row]);
    this.solved = board.solved;
    this.roundPoints = board.points;
    this.draft = '';
  }

  #resetBoard(): void {
    this.guesses = [];
    this.results = [];
    this.draft = '';
    this.solved = false;
    this.roundPoints = null;
    this.error = null;
  }

  #adoptSession(data: SessionResult): void {
    this.code = data.code;
    this.role = data.role;
    this.identity = data.identity;
    this.snapshot = data.snapshot;
    this.match = data.match;
    this.leaderboard = data.leaderboard;
    saveIdentity(data.code, data.identity);

    const current = data.match?.rounds[data.match.currentRoundIndex];
    this.window = current ?? null;

    const game = data.gameState as CipherSessionState | undefined;
    if (game !== undefined) {
      this.hasSecret = game.hasSecret;
      this.secret = game.secret ?? null;
      this.progress = game.progress ?? [];
      if (game.board !== null && game.board !== undefined) this.#applyBoard(game.board);
      else this.#resetBoard();
    }
  }

  // ---- commands -----------------------------------------------------------

  async host(displayName: string, roundCount: number): Promise<string> {
    const data = await request<SessionResult>(this.socket, 'room:create', {
      displayName,
      gameId: 'cipher',
      roundCount,
    });
    this.#adoptSession(data);
    return data.code;
  }

  async join(code: string, displayName: string): Promise<void> {
    const data = await request<SessionResult>(this.socket, 'room:join', {
      code,
      displayName,
    });
    this.#adoptSession(data);
  }

  /** Restore a seat from localStorage. Returns false if there is nothing to restore. */
  async tryResume(code: string): Promise<boolean> {
    const identity = loadIdentity(code);
    if (identity === null) return false;
    this.code = code;
    this.identity = identity;
    return this.#resume();
  }

  async #resume(): Promise<boolean> {
    if (this.identity === null) return false;
    try {
      const data = await request<SessionResult>(this.socket, 'room:resume', {
        code: this.code,
        identity: this.identity,
      });
      this.#adoptSession(data);
      return true;
    } catch {
      this.identity = null;
      return false;
    }
  }

  // ---- typing -------------------------------------------------------------

  press(letter: string): void {
    if (!this.canType || this.draft.length >= WORD_LENGTH) return;
    this.error = null;
    this.draft += letter.toLowerCase();
  }

  backspace(): void {
    if (!this.canType) return;
    this.error = null;
    this.draft = this.draft.slice(0, -1);
  }

  /**
   * The spec's central rule lives here: a word that is not on the allow list is
   * refused locally, the draft row is left exactly as typed so it can be
   * edited, and nothing is sent. The server re-checks anyway — a stale tab
   * could hold an old list — and its rejection lands in the same place.
   */
  async submit(): Promise<void> {
    if (!this.canType || this.submitting) return;

    const entry = validateEntry(this.draft);
    if (!entry.ok) {
      this.#rejectDraft(entry.message);
      return;
    }

    this.submitting = true;
    try {
      const accepted = await request<GuessAccepted>(this.socket, 'cipher:guess', {
        guess: entry.word,
      });
      this.guesses = [...this.guesses, entry.word];
      this.results = [...this.results, accepted.result];
      this.draft = '';
      this.error = null;
      this.revealToken += 1;
      if (accepted.solved) {
        this.solved = true;
        this.roundPoints = accepted.points;
      }
    } catch (err) {
      const message = err instanceof RequestError ? err.detail.message : 'Could not send that';
      this.#rejectDraft(message);
    } finally {
      this.submitting = false;
    }
  }

  #rejectDraft(message: string): void {
    this.error = message;
    // Bumping the token restarts the shake animation even for the same message.
    this.shakeToken += 1;
  }

  dismissError(): void {
    this.error = null;
  }

  // ---- facilitator commands ----------------------------------------------

  async setSecret(word: string): Promise<boolean> {
    const entry = validateEntry(word);
    if (!entry.ok) {
      this.error = entry.message;
      this.shakeToken += 1;
      return false;
    }
    try {
      const data = await request<{ word: string }>(this.socket, 'cipher:setSecret', {
        word: entry.word,
      });
      this.secret = data.word;
      this.hasSecret = true;
      this.error = null;
      return true;
    } catch (err) {
      this.error = err instanceof RequestError ? err.detail.message : NOT_ALLOWED_MESSAGE;
      this.shakeToken += 1;
      return false;
    }
  }

  async randomSecret(): Promise<void> {
    try {
      const data = await request<{ word: string }>(this.socket, 'cipher:randomSecret');
      this.secret = data.word;
      this.hasSecret = true;
      this.error = null;
    } catch (err) {
      this.error = err instanceof RequestError ? err.detail.message : 'Could not pick a word';
    }
  }

  async startRound(): Promise<void> {
    try {
      await request<null>(this.socket, 'match:start');
      this.reveal = null;
      this.error = null;
    } catch (err) {
      this.error = err instanceof RequestError ? err.detail.message : 'Could not start the round';
    }
  }

  async endRound(): Promise<void> {
    try {
      await request<null>(this.socket, 'round:advance');
    } catch (err) {
      this.error = err instanceof RequestError ? err.detail.message : 'Could not end the round';
    }
  }
}
