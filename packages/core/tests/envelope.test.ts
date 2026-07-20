import { describe, expect, it } from "vitest";
import { broadcast, envelope, isEnvelopeShape } from "../src/index.js";

describe("envelope", () => {
  it("populates id, type, payload, and timestamp", () => {
    const before = Date.now();
    const msg = envelope("room:create", { hostName: "Ada" });
    expect(msg.id).toMatch(/^m_/);
    expect(msg.type).toBe("room:create");
    expect(msg.payload).toEqual({ hostName: "Ada" });
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(Date.now());
    expect(msg.gameId).toBeUndefined();
  });

  it("generates a unique id per call", () => {
    const a = envelope("room:leave", {});
    const b = envelope("room:leave", {});
    expect(a.id).not.toBe(b.id);
  });

  it("includes gameId only when provided", () => {
    const withGame = envelope("guess", { value: 1 }, { gameId: "trivia" });
    expect(withGame.gameId).toBe("trivia");
    const without = envelope("guess", { value: 1 });
    expect("gameId" in without).toBe(false);
  });
});

describe("broadcast", () => {
  it("wraps a message with target and optional replyTo", () => {
    const msg = broadcast("room:state", { room: 1 }, "all", "m_1");
    expect(msg.type).toBe("room:state");
    expect(msg.target).toBe("all");
    expect(msg.replyTo).toBe("m_1");
    expect(msg.id).toMatch(/^m_/);
  });

  it("omits replyTo when not provided", () => {
    const msg = broadcast("room:state", { room: 1 }, "all");
    expect("replyTo" in msg).toBe(false);
  });
});

describe("isEnvelopeShape", () => {
  const valid = {
    id: "m_1",
    type: "room:leave",
    payload: {},
    timestamp: 123,
  };

  it("accepts a valid envelope", () => {
    expect(isEnvelopeShape(valid)).toBe(true);
  });

  it("accepts an envelope with a string gameId", () => {
    expect(isEnvelopeShape({ ...valid, gameId: "trivia" })).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isEnvelopeShape(null)).toBe(false);
    expect(isEnvelopeShape(undefined)).toBe(false);
    expect(isEnvelopeShape("hello")).toBe(false);
    expect(isEnvelopeShape(42)).toBe(false);
  });

  it("rejects envelopes with missing or mistyped fields", () => {
    expect(isEnvelopeShape({ ...valid, id: undefined })).toBe(false);
    expect(isEnvelopeShape({ ...valid, type: 7 })).toBe(false);
    expect(isEnvelopeShape({ ...valid, timestamp: "now" })).toBe(false);
    expect(isEnvelopeShape({ id: "m_1", type: "x", timestamp: 1 })).toBe(false);
    expect(isEnvelopeShape({ ...valid, gameId: 5 })).toBe(false);
  });
});
