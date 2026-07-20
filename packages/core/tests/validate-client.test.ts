import { describe, expect, it } from "vitest";
import { roomCreate, roomJoin, roomLeave, validateClient } from "../src/index.js";

describe("validateClient", () => {
  it("accepts every client builder output", () => {
    expect(validateClient(roomCreate({ hostName: "Ada" })).ok).toBe(true);
    expect(validateClient(roomJoin({ roomId: "ABCD", name: "Grace" })).ok).toBe(true);
    expect(
      validateClient(roomJoin({ roomId: "ABCD", name: "Grace", asHost: true })).ok,
    ).toBe(true);
    expect(validateClient(roomLeave()).ok).toBe(true);
  });

  it("returns the typed message on success", () => {
    const msg = roomCreate({ hostName: "Ada" });
    const result = validateClient(msg);
    expect(result).toEqual({ ok: true, msg });
  });

  it("rejects non-object envelopes", () => {
    expect(validateClient(null).ok).toBe(false);
    expect(validateClient("nope").ok).toBe(false);
  });

  it("rejects envelopes missing required envelope fields", () => {
    const msg = roomLeave();
    expect(validateClient({ ...msg, type: undefined }).ok).toBe(false);
    expect(validateClient({ ...msg, id: undefined }).ok).toBe(false);
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
    const create = validateClient({
      ...roomCreate({ hostName: "Ada" }),
      payload: { hostName: 5 },
    });
    expect(create.ok).toBe(false);
    if (!create.ok) expect(create.error).toContain("room:create.hostName");

    const join = roomJoin({ roomId: "ABCD", name: "Grace" });
    const missingName = validateClient({ ...join, payload: { roomId: "ABCD" } });
    expect(missingName.ok).toBe(false);
    if (!missingName.ok) expect(missingName.error).toContain("room:join.name");

    const badHost = validateClient({
      ...join,
      payload: { roomId: "ABCD", name: "G", asHost: "yes" },
    });
    expect(badHost.ok).toBe(false);
    if (!badHost.ok) expect(badHost.error).toContain("room:join.asHost");
  });

  it("treats optional fields as optional", () => {
    const join = roomJoin({ roomId: "ABCD", name: "Grace" });
    expect("asHost" in join.payload).toBe(false);
    expect(validateClient(join).ok).toBe(true);
  });
});
