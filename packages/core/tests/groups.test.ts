import { describe, expect, it } from "vitest";
import { chunkChains, normalizeText, pairUp, shuffled, toCatalog } from "../src/index.js";
import type { AnyGameDefinition } from "../src/index.js";

function seeded(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe("shuffled", () => {
  it("permutes without losing or duplicating items", () => {
    const items = ["a", "b", "c", "d", "e"];
    const result = shuffled(items, seeded([0.9, 0.1, 0.5, 0.3]));
    expect([...result].sort()).toEqual([...items].sort());
    expect(items).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("pairUp", () => {
  it("pairs an even pool with no bye", () => {
    const { pairs, bye } = pairUp([1, 2, 3, 4], seeded([0.2, 0.7]));
    expect(pairs).toHaveLength(2);
    expect(bye).toBeNull();
    expect(pairs.flat().sort()).toEqual([1, 2, 3, 4]);
  });

  it("leaves one bye for an odd pool", () => {
    const { pairs, bye } = pairUp([1, 2, 3, 4, 5], seeded([0.4, 0.8, 0.1]));
    expect(pairs).toHaveLength(2);
    expect(bye).not.toBeNull();
    expect([...pairs.flat(), bye].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles a single participant", () => {
    const { pairs, bye } = pairUp([9], seeded([0.5]));
    expect(pairs).toEqual([]);
    expect(bye).toBe(9);
  });
});

describe("chunkChains", () => {
  it("splits into chains of the requested size", () => {
    const chains = chunkChains([1, 2, 3, 4, 5, 6], 3, seeded([0.1, 0.6, 0.3]));
    expect(chains).toHaveLength(2);
    expect(chains.every((c) => c.length === 3)).toBe(true);
    expect(chains.flat().sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("merges a trailing single into the previous chain", () => {
    const chains = chunkChains([1, 2, 3, 4, 5, 6, 7], 3, seeded([0.2, 0.9, 0.4]));
    expect(chains).toHaveLength(2);
    expect(chains[1]).toHaveLength(4);
    expect(chains.flat().sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps a lone undersized chain when it is the only one", () => {
    const chains = chunkChains([1], 3, seeded([0.5]));
    expect(chains).toEqual([[1]]);
  });
});

describe("normalizeText", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeText("  Deep   BLUE\tSea ")).toBe("deep blue sea");
  });
});

describe("toCatalog stability", () => {
  const base = {
    description: "",
    minPlayers: 1,
    defaultVariant: "v",
    variants: { v: { name: "V", description: "", configFields: {} } },
    messages: {},
    setup: () => ({ state: null }),
    reduce: (state: unknown) => ({ state }),
    view: () => ({}),
    results: () => [],
  };

  it("passes stability through and omits it when unset", () => {
    const catalog = toCatalog([
      { ...base, id: "wip", name: "WIP", stability: "alpha" } as AnyGameDefinition,
      { ...base, id: "solid", name: "Solid" } as AnyGameDefinition,
    ]);
    expect(catalog[0]!.stability).toBe("alpha");
    expect("stability" in catalog[1]!).toBe(false);
  });
});
