import { describe, expect, it } from "vitest";
import { generateId, generateRoomId } from "../src/index.js";

describe("generateRoomId", () => {
  it("defaults to 4 characters", () => {
    expect(generateRoomId()).toHaveLength(4);
  });

  it("respects the requested length", () => {
    expect(generateRoomId(6)).toHaveLength(6);
  });

  it("only uses unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomId()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    }
  });
});

describe("generateId", () => {
  it("prefixes when a prefix is given", () => {
    expect(generateId("p")).toMatch(/^p_.+/);
  });

  it("omits the separator without a prefix", () => {
    expect(generateId()).not.toMatch(/^_/);
    expect(generateId().length).toBeGreaterThan(0);
  });

  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId("m")));
    expect(ids.size).toBe(1000);
  });
});
