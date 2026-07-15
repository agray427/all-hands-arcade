import type { RoomStore } from "./rooms.js";

export interface SessionSource {
  hasSession(roomCode: string): boolean;
  sessionNeedsHost(roomCode: string): boolean;
}

export class RoomJanitor {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private store: RoomStore,
    private games: SessionSource,
    private ttlMs: number,
    private onExpire: (code: string) => void,
  ) {}

  check(code: string): void {
    if (this.shouldExpire(code)) this.arm(code);
    else this.disarm(code);
  }

  disarm(code: string): void {
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private shouldExpire(code: string): boolean {
    const view = this.store.get(code);
    if (!view) return false;
    if (this.games.hasSession(code) && !this.games.sessionNeedsHost(code)) return false;
    return !Object.values(view.participants).some(
      (p) => p.role === "host" && p.connected,
    );
  }

  private arm(code: string): void {
    if (this.timers.has(code)) return;
    const timer = setTimeout(() => {
      this.timers.delete(code);
      if (this.shouldExpire(code)) this.onExpire(code);
    }, this.ttlMs);
    this.timers.set(code, timer);
  }
}
