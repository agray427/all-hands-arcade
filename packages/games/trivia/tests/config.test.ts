import { describe, expect, it } from "vitest";
import { resolveConfig, toCatalog } from "@arcade/core";
import { decks, trivia } from "../src/index.js";

describe("trivia config", () => {
  it("rejects survival minTimeMs below one second", () => {
    expect(resolveConfig(trivia, "survival", { minTimeMs: 999 })).toMatchObject({
      ok: false,
      code: "INVALID_CONFIG",
      error: "minTimeMs must be at least 1000",
    });
    expect(resolveConfig(trivia, "survival", { minTimeMs: 1000 })).toMatchObject({
      ok: true,
    });
  });

  it("rejects unknown decks", () => {
    expect(resolveConfig(trivia, "classic", { deck: "does-not-exist" })).toMatchObject({
      ok: false,
      code: "INVALID_CONFIG",
    });
  });

  it("defaults to the first deck and the classic variant", () => {
    const resolved = resolveConfig(trivia, undefined, undefined);
    expect(resolved).toMatchObject({
      ok: true,
      variantId: "classic",
    });
    if (resolved.ok) expect(resolved.config.deck).toBe(decks[0]!.id);
  });

  it("rejects unknown variants", () => {
    expect(resolveConfig(trivia, "blitz", undefined)).toMatchObject({
      ok: false,
      code: "NO_SUCH_VARIANT",
    });
  });

  it("exposes both variants and deck options in the catalog", () => {
    const [entry] = toCatalog([trivia]);
    expect(entry!.defaultVariant).toBe("classic");
    expect(entry!.variants.map((v) => v.id).sort()).toEqual([
      "classic",
      "host-paced",
      "survival",
    ]);
    const classic = entry!.variants.find((v) => v.id === "classic")!;
    expect(classic.configFields.deck!.options!.map((o) => o.value)).toEqual([
      ...decks.map((d) => d.id),
      "custom",
    ]);
  });
});
