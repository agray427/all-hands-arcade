import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameCatalog } from "@arcade/core";
import {
  deleteSetup,
  exportSetups,
  importSetups,
  listSetups,
  saveSetup,
  type SetupsFile,
} from "../src/lib/setups.js";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
});

const catalog: GameCatalog = [
  {
    id: "trivia",
    name: "Trivia",
    description: "",
    minPlayers: 1,
    defaultVariant: "classic",
    variants: [
      {
        id: "classic",
        name: "Classic",
        description: "",
        hostDriven: false,
        configFields: {
          deck: {
            type: "string",
            label: "Deck",
            default: "general",
            options: [
              { value: "general", label: "General" },
              { value: "custom", label: "Custom deck" },
            ],
          },
          customDeck: {
            type: "string",
            label: "Custom questions",
            multiline: true,
            when: { field: "deck", equals: "custom" },
          },
          rounds: { type: "number", label: "Rounds", min: 1 },
        },
      },
      {
        id: "survival",
        name: "Survival",
        description: "",
        hostDriven: false,
        configFields: {
          deck: {
            type: "string",
            label: "Deck",
            default: "general",
            options: [{ value: "general", label: "General" }],
          },
          minTimeMs: { type: "number", label: "Min time", default: 2000, min: 1000 },
        },
      },
    ],
  },
];

const quiz = {
  gameId: "trivia",
  variantId: "classic",
  name: "Office quiz",
  config: { deck: "custom", customDeck: "Q? | *a | b", rounds: 2 },
};

describe("setup storage", () => {
  beforeEach(() => storage.clear());

  it("saves, lists, and deletes setups", () => {
    const saved = saveSetup(quiz);
    expect(listSetups()).toEqual([saved]);
    expect(saved.id).toMatch(/^s_/);

    deleteSetup(saved.id);
    expect(listSetups()).toEqual([]);
  });

  it("upserts by game, variant, and name", () => {
    const first = saveSetup(quiz);
    const second = saveSetup({ ...quiz, config: { deck: "general" } });
    expect(second.id).toBe(first.id);
    expect(listSetups()).toHaveLength(1);
    expect(listSetups()[0]!.config).toEqual({ deck: "general" });

    saveSetup({ ...quiz, name: "Other" });
    saveSetup({ ...quiz, variantId: "survival", config: {} });
    expect(listSetups()).toHaveLength(3);
  });

  it("survives corrupted storage", () => {
    storage.set("arcade:setups", "{nope");
    expect(listSetups()).toEqual([]);
  });
});

describe("exportSetups", () => {
  beforeEach(() => storage.clear());

  it("exports only the selected setups as a portable file", () => {
    const a = saveSetup(quiz);
    saveSetup({ ...quiz, name: "Not this one" });
    const b = saveSetup({ ...quiz, variantId: "survival", name: "Hard", config: { minTimeMs: 1500 } });

    const file = JSON.parse(exportSetups([a.id, b.id])) as SetupsFile;
    expect(file.kind).toBe("arcade-setups");
    expect(file.version).toBe(1);
    expect(file.setups).toEqual([
      { gameId: "trivia", variantId: "classic", name: "Office quiz", config: quiz.config },
      { gameId: "trivia", variantId: "survival", name: "Hard", config: { minTimeMs: 1500 } },
    ]);
    expect(JSON.stringify(file)).not.toContain('"id"');
  });
});

describe("importSetups", () => {
  beforeEach(() => storage.clear());

  it("round-trips an export", () => {
    const saved = saveSetup(quiz);
    const file = exportSetups([saved.id]);
    deleteSetup(saved.id);

    const outcome = importSetups(file, catalog);
    expect(outcome.error).toBeUndefined();
    expect(outcome.skipped).toEqual([]);
    expect(outcome.imported).toHaveLength(1);
    expect(listSetups()[0]).toMatchObject(quiz);
  });

  it("imports multiple entries and routes each to its game and variant", () => {
    const file = JSON.stringify({
      kind: "arcade-setups",
      version: 1,
      setups: [
        quiz,
        { gameId: "trivia", variantId: "survival", name: "Hard", config: { minTimeMs: 1500 } },
      ],
    });
    const outcome = importSetups(file, catalog);
    expect(outcome.imported.map((s) => [s.variantId, s.name])).toEqual([
      ["classic", "Office quiz"],
      ["survival", "Hard"],
    ]);
  });

  it("accepts a bare array and a single object", () => {
    expect(importSetups(JSON.stringify([quiz]), catalog).imported).toHaveLength(1);
    storage.clear();
    expect(importSetups(JSON.stringify(quiz), catalog).imported).toHaveLength(1);
  });

  it("is idempotent for repeated imports", () => {
    const file = JSON.stringify([quiz]);
    importSetups(file, catalog);
    importSetups(file, catalog);
    expect(listSetups()).toHaveLength(1);
  });

  it("skips entries for unknown games and variants with reasons", () => {
    const outcome = importSetups(
      JSON.stringify([
        quiz,
        { ...quiz, name: "Chess one", gameId: "chess" },
        { ...quiz, name: "Blitz one", variantId: "blitz" },
      ]),
      catalog,
    );
    expect(outcome.imported).toHaveLength(1);
    expect(outcome.skipped).toEqual([
      { label: "Chess one", reason: '"chess" is not an installed game' },
      { label: "Blitz one", reason: 'Trivia has no "blitz" variant' },
    ]);
  });

  it("skips malformed entries with reasons", () => {
    const outcome = importSetups(
      JSON.stringify([
        42,
        { gameId: "trivia", variantId: "classic", config: {} },
        { ...quiz, name: "Bad rounds", config: { rounds: "five" } },
        { ...quiz, name: "Bad deck", config: { deck: "unknown-deck" } },
        { ...quiz, name: "Bad config", config: "nope" },
      ]),
      catalog,
    );
    expect(outcome.imported).toEqual([]);
    expect(outcome.skipped).toEqual([
      { label: "entry 1", reason: "not an object" },
      { label: "entry 2", reason: "missing a name" },
      { label: "Bad rounds", reason: "rounds must be a number" },
      {
        label: "Bad deck",
        reason: "deck must be one of: general, custom",
      },
      { label: "Bad config", reason: "config must be an object" },
    ]);
  });

  it("drops config keys the variant does not declare", () => {
    const outcome = importSetups(
      JSON.stringify([{ ...quiz, config: { ...quiz.config, hacked: true } }]),
      catalog,
    );
    expect(outcome.imported[0]!.config).toEqual(quiz.config);
  });

  it("rejects unrecognized files outright", () => {
    expect(importSetups("{nope", catalog).error).toBe("not valid JSON");
    expect(importSetups('{"kind":"other-thing","setups":[]}', catalog).error).toContain(
      "unrecognized file kind",
    );
    expect(
      importSetups('{"kind":"arcade-setups","version":2,"setups":[]}', catalog).error,
    ).toContain("unsupported setups version");
    expect(importSetups('"just a string"', catalog).error).toContain("expected a setups");
  });
});
