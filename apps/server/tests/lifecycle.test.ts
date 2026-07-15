import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomJanitor } from "../src/lifecycle.js";
import { RoomStore } from "../src/rooms.js";

const TTL = 1000;

describe("RoomJanitor", () => {
  let store: RoomStore;
  let sessions: Set<string>;
  let expired: string[];
  let janitor: RoomJanitor;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new RoomStore();
    sessions = new Set();
    expired = [];
    janitor = new RoomJanitor(
      store,
      { hasSession: (code) => sessions.has(code) },
      TTL,
      (code) => expired.push(code),
    );
  });

  afterEach(() => {
    janitor.dispose();
    vi.useRealTimers();
  });

  it("does not expire a room with a connected host", () => {
    const { view } = store.create("Ada");
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL * 3);
    expect(expired).toEqual([]);
  });

  it("expires a room after all hosts stay disconnected for the ttl", () => {
    const { view, host } = store.create("Ada");
    store.join(view.code, "Grace", false);
    store.setConnected(view.code, host.id, false);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL - 1);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(expired).toEqual([view.code]);
  });

  it("host reconnect before the ttl disarms the timer", () => {
    const { view, host } = store.create("Ada");
    store.setConnected(view.code, host.id, false);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL - 1);
    store.setConnected(view.code, host.id, true);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL * 3);
    expect(expired).toEqual([]);
  });

  it("a second host still connected keeps the room alive", () => {
    const { view, host } = store.create("Ada");
    store.join(view.code, "Hedy", true);
    store.setConnected(view.code, host.id, false);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL * 3);
    expect(expired).toEqual([]);
  });

  it("never expires a room while a game session is active", () => {
    const { view, host } = store.create("Ada");
    sessions.add(view.code);
    store.setConnected(view.code, host.id, false);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL * 3);
    expect(expired).toEqual([]);
  });

  it("arms after the game session ends when hosts are gone", () => {
    const { view, host } = store.create("Ada");
    sessions.add(view.code);
    store.setConnected(view.code, host.id, false);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL * 3);
    sessions.delete(view.code);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL);
    expect(expired).toEqual([view.code]);
  });

  it("re-checks the condition when the timer fires", () => {
    const { view, host } = store.create("Ada");
    store.setConnected(view.code, host.id, false);
    janitor.check(view.code);
    store.setConnected(view.code, host.id, true);
    vi.advanceTimersByTime(TTL);
    expect(expired).toEqual([]);
  });

  it("expires a room everyone has left", () => {
    const { view, host } = store.create("Ada");
    store.remove(view.code, host.id);
    janitor.check(view.code);
    vi.advanceTimersByTime(TTL);
    expect(expired).toEqual([view.code]);
  });
});
