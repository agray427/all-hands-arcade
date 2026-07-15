import { createServer } from "node:http";
import { Server } from "socket.io";
import { roomState, type Role, type ServerBroadcastEnvelope } from "@arcade/core";
import { RoomStore } from "./rooms.js";
import { handle, type Outbound } from "./router.js";

interface ClientToServerEvents {
  "message:incoming": (raw: unknown) => void;
}

interface ServerToClientEvents {
  "message:outgoing": (message: ServerBroadcastEnvelope) => void;
}

interface InterServerEvents {
  [event: string]: never;
}

interface SocketData {
  participantId: string | null;
  roomCode: string | null;
  role: Role | null;
}

export type ArcadeIoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface ArcadeServerOptions {
  port: number;
  clientOrigin: string;
}

export interface ArcadeServer {
  io: ArcadeIoServer;
  store: RoomStore;
  port: number;
  close(): Promise<void>;
}

function roleRoom(code: string, role: Role): string {
  return `${code}:${role}s`;
}

export async function createArcadeServer(
  options: ArcadeServerOptions,
): Promise<ArcadeServer> {
  const store = new RoomStore();
  const httpServer = createServer();
  const io: ArcadeIoServer = new Server(httpServer, {
    cors: { origin: options.clientOrigin },
  });

  io.on("connection", (socket) => {
    socket.data.participantId = null;
    socket.data.roomCode = null;
    socket.data.role = null;

    const emit = (out: Outbound) => {
      const code = socket.data.roomCode;
      switch (out.target) {
        case "self":
          socket.emit("message:outgoing", out.message);
          return;
        case "all":
          if (code) io.to(code).emit("message:outgoing", out.message);
          return;
        case "host":
          if (code) io.to(`${code}:hosts`).emit("message:outgoing", out.message);
          return;
        case "players":
          if (code) io.to(`${code}:players`).emit("message:outgoing", out.message);
          return;
        default:
          io.to(out.target).emit("message:outgoing", out.message);
      }
    };

    socket.on("message:incoming", (raw) => {
      const result = handle(store, socket.data, raw);

      if (result.identity) {
        const { participantId, roomCode, role } = result.identity;
        socket.data.participantId = participantId;
        socket.data.roomCode = roomCode;
        socket.data.role = role;
        socket.join(roomCode);
        socket.join(roleRoom(roomCode, role));
      }

      for (const out of result.outbound) emit(out);

      if (result.leave && socket.data.roomCode) {
        socket.leave(socket.data.roomCode);
        if (socket.data.role) socket.leave(roleRoom(socket.data.roomCode, socket.data.role));
        socket.data.participantId = null;
        socket.data.roomCode = null;
        socket.data.role = null;
      }
    });

    socket.on("disconnect", () => {
      const { roomCode, participantId } = socket.data;
      if (!roomCode || !participantId) return;
      const view = store.setConnected(roomCode, participantId, false);
      if (view) io.to(roomCode).emit("message:outgoing", roomState({ room: view }, "all"));
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(options.port, resolve));
  const address = httpServer.address();
  const port =
    typeof address === "object" && address !== null ? address.port : options.port;

  return {
    io,
    store,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
