export const manifest = {
  client: {
    "room:create": { hostName: "string" },
    "room:join": { roomCode: "string", name: "string", asHost: "boolean?" },
    "room:leave": {},
    "game:list": {},
    "game:start": { gameId: "string", variantId: "string?", config: "object?" },
    "game:end": {},
  },
  server: {
    "room:welcome": { room: "RoomView", youId: "string" },
    "room:state": { room: "RoomView" },
    "room:player_joined": { player: "Participant" },
    "engine:error": { code: "EngineErrorCode", message: "string" },
    "game:catalog": { games: "GameCatalog" },
    "game:started": { gameId: "string", variantId: "string", config: "object" },
    "game:state": { gameId: "string", view: "GameView" },
    "game:ended": { gameId: "string", results: "GameResults" },
  },
} as const;

export type Manifest = typeof manifest;
