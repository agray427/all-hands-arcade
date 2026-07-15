export const manifest = {
  client: {
    "room:create": { hostName: "string" },
    "room:join": { roomCode: "string", name: "string", asHost: "boolean?" },
    "room:leave": {},
  },
  server: {
    "room:welcome": { room: "RoomView", youId: "string" },
    "room:state": { room: "RoomView" },
    "room:player_joined": { player: "Participant" },
    "engine:error": { code: "EngineErrorCode", message: "string" },
  },
} as const;

export type Manifest = typeof manifest;
