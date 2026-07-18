export const config = {
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  roomTtlMs: Number(process.env.ROOM_TTL_MS ?? 300_000),
};
