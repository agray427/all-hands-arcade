import { describe, expect, it } from "vitest";
import { envelope, isEnvelopeShape } from "../src/index.js";

describe("envelope", () => {
  it("populates messageId, type, payload, and timestamp", () => {
    const before = Date.now();
    const msg = envelope("room:create", { hostName: "Ada" });
    expect(msg.messageId).toMatch(/^m_/);
    expect(msg.type).toBe("room:create");
    expect(msg.payload).toEqual({ hostName: "Ada" });
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(Date.now());
    expect(msg.gameId).toBeUndefined();
  });

  it("generates a unique messageId per call", () => {
    const a = envelope("room:leave", {});
    const b = envelope("room:leave", {});
    expect(a.messageId).not.toBe(b.messageId);
  });

  it("includes gameId only when provided", () => {
    const withGame = envelope("guess", { value: 1 }, { gameId: "trivia" });
    expect(withGame.gameId).toBe("trivia");
    const without = envelope("guess", { value: 1 });
    expect("gameId" in without).toBe(false);
  });
});

describe("isEnvelopeShape", () => {
  const valid = {
    messageId: "m_1",
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
    expect(isEnvelopeShape({ ...valid, messageId: undefined })).toBe(false);
    expect(isEnvelopeShape({ ...valid, type: 7 })).toBe(false);
    expect(isEnvelopeShape({ ...valid, timestamp: "now" })).toBe(false);
    expect(isEnvelopeShape({ messageId: "m_1", type: "x", timestamp: 1 })).toBe(false);
    expect(isEnvelopeShape({ ...valid, gameId: 5 })).toBe(false);
  });
});
