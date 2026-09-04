import type { AnyGameModule, GameMeta } from '@arcade/core';
import { rpsls } from '@arcade/rpsls';

const modules = [rpsls] as unknown as AnyGameModule[];

const registry = new Map<string, AnyGameModule>(modules.map((game) => [game.id, game]));

export function getGame(gameId: string): AnyGameModule | undefined {
  return registry.get(gameId);
}

export function listGames(): GameMeta[] {
  return [...registry.values()].map(({ id, name, tagline, minPlayers }) => ({
    id,
    name,
    tagline,
    minPlayers,
  }));
}
