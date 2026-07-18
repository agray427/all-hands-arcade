import { describe, expect, it } from "vitest";
import { validatePayload } from "../src/index.js";

describe("validatePayload", () => {
  const fields = { name: "string", count: "number", live: "boolean?", extra: "object?" };

  it("accepts a payload matching the spec", () => {
    expect(validatePayload(fields, { name: "a", count: 1 })).toEqual({ ok: true });
    expect(
      validatePayload(fields, { name: "a", count: 1, live: true, extra: {} }),
    ).toEqual({ ok: true });
  });

  it("rejects non-object payloads", () => {
    expect(validatePayload(fields, null).ok).toBe(false);
    expect(validatePayload(fields, "x").ok).toBe(false);
  });

  it("rejects missing required fields", () => {
    expect(validatePayload(fields, { name: "a" })).toEqual({
      ok: false,
      error: "count must be number",
    });
  });

  it("rejects mistyped fields", () => {
    expect(validatePayload(fields, { name: 3, count: 1 })).toEqual({
      ok: false,
      error: "name must be string",
    });
    expect(validatePayload(fields, { name: "a", count: 1, live: "yes" })).toEqual({
      ok: false,
      error: "live must be boolean",
    });
    expect(validatePayload(fields, { name: "a", count: 1, extra: null })).toEqual({
      ok: false,
      error: "extra must be object",
    });
  });

  it("allows omitted optional fields and unknown extras", () => {
    expect(validatePayload(fields, { name: "a", count: 1, other: "ignored" })).toEqual({
      ok: true,
    });
  });
});
