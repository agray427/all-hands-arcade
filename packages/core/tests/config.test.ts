import { describe, expect, it } from "vitest";
import { resolveConfig, toCatalog, type GameDefinition } from "../src/index.js";

const game: GameDefinition<{ ok: true }> = {
  id: "demo",
  name: "Demo",
  description: "A demo game.",
  minPlayers: 1,
  defaultVariant: "basic",
  variants: {
    basic: {
      name: "Basic",
      description: "Plain rules.",
      configFields: {
        rounds: { type: "number", label: "Rounds", min: 1 },
        deck: {
          type: "string",
          label: "Deck",
          default: "alpha",
          options: [
            { value: "alpha", label: "Alpha" },
            { value: "beta", label: "Beta" },
          ],
        },
        betaNote: {
          type: "string",
          label: "Beta note",
          multiline: true,
          when: { field: "deck", equals: "beta" },
        },
      },
    },
    strict: {
      name: "Strict",
      description: "With refinement.",
      configFields: {
        minTimeMs: { type: "number", label: "Minimum time (ms)", default: 2000 },
      },
      validateConfig: (config) =>
        typeof config.minTimeMs === "number" && config.minTimeMs < 1000
          ? "minTimeMs must be at least 1000"
          : null,
    },
  },
  messages: {},
  setup: () => ({ state: { ok: true } }),
  reduce: (state) => ({ state }),
  view: () => null,
  results: () => [],
};

describe("resolveConfig", () => {
  it("falls back to the default variant", () => {
    const result = resolveConfig(game, undefined, undefined);
    expect(result).toEqual({ ok: true, variantId: "basic", config: { deck: "alpha" } });
  });

  it("rejects unknown variants", () => {
    const result = resolveConfig(game, "nope", undefined);
    expect(result).toMatchObject({ ok: false, code: "NO_SUCH_VARIANT" });
  });

  it("merges defaults and keeps defaultless fields unset for the game to resolve", () => {
    const result = resolveConfig(game, "basic", {});
    expect(result).toEqual({ ok: true, variantId: "basic", config: { deck: "alpha" } });
  });

  it("applies overrides with type checking", () => {
    expect(resolveConfig(game, "basic", { rounds: 5, deck: "beta" })).toEqual({
      ok: true,
      variantId: "basic",
      config: { rounds: 5, deck: "beta" },
    });
    expect(resolveConfig(game, "basic", { rounds: "5" })).toMatchObject({
      ok: false,
      code: "INVALID_CONFIG",
      error: "rounds must be number",
    });
  });

  it("enforces min", () => {
    expect(resolveConfig(game, "basic", { rounds: 0 })).toMatchObject({
      ok: false,
      error: "rounds must be at least 1",
    });
  });

  it("enforces options membership", () => {
    expect(resolveConfig(game, "basic", { deck: "gamma" })).toMatchObject({
      ok: false,
      code: "INVALID_CONFIG",
      error: "deck must be one of: alpha, beta",
    });
  });

  it("ignores conditional fields when their condition is not met", () => {
    const result = resolveConfig(game, "basic", { deck: "alpha", betaNote: "hi" });
    expect(result).toEqual({ ok: true, variantId: "basic", config: { deck: "alpha" } });
  });

  it("validates conditional fields when their condition is met", () => {
    expect(resolveConfig(game, "basic", { deck: "beta", betaNote: "hi" })).toEqual({
      ok: true,
      variantId: "basic",
      config: { deck: "beta", betaNote: "hi" },
    });
    expect(resolveConfig(game, "basic", { deck: "beta", betaNote: 7 })).toMatchObject({
      ok: false,
      code: "INVALID_CONFIG",
      error: "betaNote must be string",
    });
  });

  it("rejects unknown config fields", () => {
    expect(resolveConfig(game, "basic", { cheats: true })).toMatchObject({
      ok: false,
      error: "unknown config field: cheats",
    });
  });

  it("runs the variant refinement", () => {
    expect(resolveConfig(game, "strict", { minTimeMs: 999 })).toMatchObject({
      ok: false,
      code: "INVALID_CONFIG",
      error: "minTimeMs must be at least 1000",
    });
    expect(resolveConfig(game, "strict", { minTimeMs: 1000 })).toEqual({
      ok: true,
      variantId: "strict",
      config: { minTimeMs: 1000 },
    });
  });
});

describe("toCatalog", () => {
  it("exposes variants with config fields for UI rendering", () => {
    const catalog = toCatalog([game]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]!.defaultVariant).toBe("basic");
    expect(catalog[0]!.variants.map((v) => v.id)).toEqual(["basic", "strict"]);
    expect(catalog[0]!.variants[0]!.configFields.deck!.options).toHaveLength(2);
  });
});
