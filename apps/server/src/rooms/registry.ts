import { createJoinCode, normalizeJoinCode, type RoomCode } from '@arcade/core';

import { RoomRuntime } from './room.js';

/** A room with nobody in it for this long is closed, so a long-lived process
 *  does not accumulate abandoned events. */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60_000;
const MAX_PARTICIPANTS = 400;

export class RoomRegistry {
  readonly #rooms = new Map<RoomCode, RoomRuntime>();
  #sweeper: NodeJS.Timeout | null = null;

  create(roundCount: number): RoomRuntime {
    let code = createJoinCode();
    for (let attempt = 0; attempt < 200 && this.#rooms.has(code); attempt += 1) {
      code = createJoinCode();
    }
    if (this.#rooms.has(code)) {
      // 32^4 codes; with this many live rooms a longer code is the honest fix.
      code = createJoinCode(6);
    }

    const room = new RoomRuntime(code, roundCount);
    this.#rooms.set(code, room);
    return room;
  }

  get(code: string): RoomRuntime | undefined {
    return this.#rooms.get(normalizeJoinCode(code));
  }

  close(code: RoomCode): void {
    const room = this.#rooms.get(code);
    if (room === undefined) return;
    room.clearTimer();
    room.status = 'closed';
    this.#rooms.delete(code);
  }

  isFull(room: RoomRuntime): boolean {
    return room.participants.size >= MAX_PARTICIPANTS;
  }

  get size(): number {
    return this.#rooms.size;
  }

  startSweeper(onClose: (room: RoomRuntime) => void): void {
    if (this.#sweeper !== null) return;
    this.#sweeper = setInterval(() => {
      const now = Date.now();
      for (const room of [...this.#rooms.values()]) {
        if (!room.hasAnyoneConnected() && now - room.lastActivityAt > IDLE_TIMEOUT_MS) {
          onClose(room);
          this.close(room.code);
        }
      }
    }, SWEEP_INTERVAL_MS);
    this.#sweeper.unref();
  }

  stop(): void {
    if (this.#sweeper !== null) {
      clearInterval(this.#sweeper);
      this.#sweeper = null;
    }
    for (const room of this.#rooms.values()) room.clearTimer();
    this.#rooms.clear();
  }
}
