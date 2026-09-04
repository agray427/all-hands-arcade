import type { RoomCode } from '@arcade/core';

import { facilitators, everyone, type ArcadeServer } from '../io.js';
import type { RoomRegistry } from './registry.js';

const TICK_MS = 250;
const LEADERBOARD_MIN_INTERVAL_MS = 2_000;

/**
 * Coalesced fan-out.
 *
 * The naive version — emit to the room on every guess — costs one serialisation
 * and one fan-out per keystroke-completion, which in a 100-player room during a
 * fast round is thousands of frames a minute. Instead each guess just flags its
 * room dirty and a single shared interval emits at most one progress frame per
 * room per tick, and one leaderboard frame every couple of seconds.
 *
 * Guess results are not broadcast at all: they go back to the guessing socket
 * on its ack callback.
 */
export class Broadcaster {
  readonly #dirtyProgress = new Set<RoomCode>();
  readonly #dirtyLeaderboard = new Set<RoomCode>();
  readonly #lastLeaderboardAt = new Map<RoomCode, number>();
  #timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly io: ArcadeServer,
    private readonly registry: RoomRegistry,
  ) {}

  markProgressDirty(code: RoomCode): void {
    this.#dirtyProgress.add(code);
  }

  markLeaderboardDirty(code: RoomCode): void {
    this.#dirtyLeaderboard.add(code);
  }

  /** Bypasses throttling — used at round resolve and match end. */
  flushLeaderboard(code: RoomCode): void {
    const room = this.registry.get(code);
    if (room === undefined) return;
    this.#dirtyLeaderboard.delete(code);
    this.#lastLeaderboardAt.set(code, Date.now());
    this.io.to(everyone(code)).emit('leaderboard:update', room.leaderboard());
  }

  flushProgress(code: RoomCode): void {
    const room = this.registry.get(code);
    if (room === undefined) return;
    this.#dirtyProgress.delete(code);
    this.io.to(facilitators(code)).emit('cipher:progress', room.progress());
  }

  start(): void {
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => this.tick(), TICK_MS);
    this.#timer.unref();
  }

  private tick(): void {
    const now = Date.now();

    for (const code of this.#dirtyProgress) {
      const room = this.registry.get(code);
      if (room === undefined) continue;
      // volatile: a progress frame superseded 250ms later is not worth queueing
      // behind a slow client's backpressure.
      this.io.to(facilitators(code)).volatile.emit('cipher:progress', room.progress());
    }
    this.#dirtyProgress.clear();

    for (const code of [...this.#dirtyLeaderboard]) {
      const last = this.#lastLeaderboardAt.get(code) ?? 0;
      if (now - last < LEADERBOARD_MIN_INTERVAL_MS) continue;
      const room = this.registry.get(code);
      if (room === undefined) {
        this.#dirtyLeaderboard.delete(code);
        continue;
      }
      this.#dirtyLeaderboard.delete(code);
      this.#lastLeaderboardAt.set(code, now);
      this.io.to(everyone(code)).volatile.emit('leaderboard:update', room.leaderboard());
    }
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}
