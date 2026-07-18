import { describe, expect, it } from "vitest";
import { toCatalog } from "@arcade/core";
import { defaultGames } from "../src/server.js";

describe("default game catalog", () => {
  it("ships all six games with distinct ids", () => {
    const catalog = toCatalog(defaultGames);
    expect(catalog.map((g) => g.id)).toEqual([
      "trivia",
      "hive-mind",
      "grand-jury",
      "telephone",
      "split-or-steal",
      "merger",
    ]);
    expect(new Set(catalog.map((g) => g.id)).size).toBe(6);
  });

  it("marks every scaffolded game alpha and leaves trivia unmarked", () => {
    const catalog = toCatalog(defaultGames);
    expect(catalog.find((g) => g.id === "trivia")!.stability).toBeUndefined();
    for (const id of ["hive-mind", "grand-jury", "telephone", "split-or-steal", "merger"]) {
      expect(catalog.find((g) => g.id === id)!.stability).toBe("alpha");
    }
  });

  it("every game declares at least one player-facing message and valid variants", () => {
    for (const game of defaultGames) {
      expect(Object.keys(game.messages).length).toBeGreaterThan(0);
      expect(game.variants[game.defaultVariant]).toBeDefined();
      expect(game.minPlayers).toBeGreaterThanOrEqual(1);
    }
  });
});
