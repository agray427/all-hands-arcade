import { describe, expect, it } from "vitest";
import {
  gameEnd,
  gameList,
  gameStart,
  roomCreate,
  roomJoin,
  roomLeave,
  validateClient,
} from "../src/index.js";

describe("validateClient", () => {
  it("accepts every client builder output", () => {
    expect(validateClient(roomCreate({ hostName: "Ada" })).ok).toBe(true);
    expect(validateClient(roomJoin({ roomCode: "ABCD", name: "Grace" })).ok).toBe(true);
    expect(
      validateClient(roomJoin({ roomCode: "ABCD", name: "Grace", asHost: true })).ok,
    ).toBe(true);
    expect(validateClient(roomLeave()).ok).toBe(true);
  });

  it("returns the typed message on success", () => {
    const msg = roomCreate({ hostName: "Ada" });
    const result = validateClient(msg);
    expect(result).toEqual({ ok: true, msg });
  });

  it("rejects non-object envelopes", () => {
    expect(validateClient(null)).toEqual({ ok: false, error: "envelope is not an object" });
    expect(validateClient("nope")).toEqual({ ok: false, error: "envelope is not an object" });
  });

  it("rejects envelopes missing required envelope fields", () => {
    const msg = roomLeave();
    expect(validateClient({ ...msg, type: undefined }).ok).toBe(false);
    expect(validateClient({ ...msg, messageId: undefined }).ok).toBe(false);
    expect(validateClient({ ...msg, timestamp: undefined }).ok).toBe(false);
    expect(validateClient({ ...msg, payload: null }).ok).toBe(false);
  });

  it("rejects unknown message types", () => {
    const result = validateClient({ ...roomLeave(), type: "room:explode" });
    expect(result).toEqual({
      ok: false,
      error: "unknown client message type: room:explode",
    });
  });

  it("rejects wrong payload field types", () => {
    const create = { ...roomCreate({ hostName: "Ada" }), payload: { hostName: 5 } };
    expect(validateClient(create)).toEqual({
      ok: false,
      error: "room:create.hostName must be string",
    });

    const join = roomJoin({ roomCode: "ABCD", name: "Grace" });
    expect(validateClient({ ...join, payload: { roomCode: "ABCD" } })).toEqual({
      ok: false,
      error: "room:join.name must be string",
    });
    expect(
      validateClient({ ...join, payload: { roomCode: "ABCD", name: "G", asHost: "yes" } }),
    ).toEqual({ ok: false, error: "room:join.asHost must be boolean" });
  });

  it("treats optional fields as optional", () => {
    const join = roomJoin({ roomCode: "ABCD", name: "Grace" });
    expect("asHost" in join.payload).toBe(false);
    expect(validateClient(join).ok).toBe(true);
  });

  it("accepts game messages with and without optional config", () => {
    expect(validateClient(gameList()).ok).toBe(true);
    expect(validateClient(gameEnd()).ok).toBe(true);
    expect(validateClient(gameStart({ gameId: "trivia" })).ok).toBe(true);
    expect(
      validateClient(
        gameStart({ gameId: "trivia", variantId: "survival", config: { minTimeMs: 2000 } }),
      ).ok,
    ).toBe(true);
  });

  it("rejects game:start with a non-object config", () => {
    const msg = { ...gameStart({ gameId: "trivia" }), payload: { gameId: "trivia", config: 5 } };
    expect(validateClient(msg)).toEqual({
      ok: false,
      error: "game:start.config must be object",
    });
    const nullConfig = {
      ...gameStart({ gameId: "trivia" }),
      payload: { gameId: "trivia", config: null },
    };
    expect(validateClient(nullConfig).ok).toBe(false);
  });
});
