import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  roomState,
  type AnyGameDefinition,
  type Participant,
  type Role,
  type ServerBroadcastEnvelope,
  type TargetAudience,
} from "@arcade/core";
import { trivia } from "@arcade/trivia";
import { GameCoordinator } from "./games.js";
import { RoomStore } from "./rooms.js";
import { handle, type GameAction, type Outbound } from "./router.js";

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
  games?: AnyGameDefinition[];
}

export interface ArcadeServer {
  io: ArcadeIoServer;
  store: RoomStore;
  games: GameCoordinator;
  port: number;
  close(): Promise<void>;
}

export const defaultGames: AnyGameDefinition[] = [trivia];

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

  const broadcast = (
    code: string,
    target: TargetAudience,
    message: ServerBroadcastEnvelope,
  ) => {
    switch (target) {
      case "all":
        io.to(code).emit("message:outgoing", message);
        return;
      case "host":
        io.to(`${code}:hosts`).emit("message:outgoing", message);
        return;
      case "players":
        io.to(`${code}:players`).emit("message:outgoing", message);
        return;
      default:
        io.to(target).emit("message:outgoing", message);
    }
  };

  const games = new GameCoordinator(options.games ?? defaultGames, broadcast);

  const playersOf = (code: string): Participant[] => {
    const view = store.get(code);
    if (!view) return [];
    return Object.values(view.participants).filter((p) => p.role === "player");
  };

  io.on("connection", (socket) => {
    socket.data.participantId = null;
    socket.data.roomCode = null;
    socket.data.role = null;

    const emit = (out: Outbound) => {
      const code = socket.data.roomCode;
      if (out.target === "self") {
        socket.emit("message:outgoing", out.message);
        return;
      }
      if (code || (out.target !== "all" && out.target !== "host" && out.target !== "players")) {
        broadcast(code ?? "", out.target, out.message);
      }
    };

    const runGameAction = (action: GameAction): ServerBroadcastEnvelope[] => {
      switch (action.kind) {
        case "list":
          return games.list(action.msg.messageId);
        case "start":
          return games.start(
            socket.data,
            action.msg.payload,
            socket.data.roomCode ? playersOf(socket.data.roomCode) : [],
            action.msg.messageId,
          );
        case "end":
          return games.end(socket.data, action.msg.messageId);
        case "game-message":
          return games.message(socket.data, action.msg);
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

      if (result.gameAction) {
        for (const message of runGameAction(result.gameAction)) {
          socket.emit("message:outgoing", message);
        }
      }

      if (result.leave && socket.data.roomCode) {
        const code = socket.data.roomCode;
        socket.leave(code);
        if (socket.data.role) socket.leave(roleRoom(code, socket.data.role));
        socket.data.participantId = null;
        socket.data.roomCode = null;
        socket.data.role = null;
        const view = store.get(code);
        if (!view || Object.keys(view.participants).length === 0) games.dispose(code);
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
    games,
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
