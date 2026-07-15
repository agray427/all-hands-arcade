import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  roomClosed,
  roomState,
  type AnyGameDefinition,
  type Participant,
  type Role,
  type ServerBroadcastEnvelope,
  type TargetAudience,
} from "@arcade/core";
import { trivia } from "@arcade/trivia";
import { GameCoordinator } from "./games.js";
import { RoomJanitor } from "./lifecycle.js";
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
  roomTtlMs?: number;
}

export const defaultRoomTtlMs = 300_000;

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

  const owners = new Map<string, string>();

  const broadcast = (
    code: string,
    target: TargetAudience | { participantId: string },
    message: ServerBroadcastEnvelope,
  ) => {
    if (typeof target === "object") {
      const socketId = owners.get(target.participantId);
      if (socketId) io.to(socketId).emit("message:outgoing", message);
      return;
    }
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

  const playersOf = (code: string): Participant[] => {
    const view = store.get(code);
    if (!view) return [];
    return Object.values(view.participants).filter((p) => p.role === "player");
  };

  const games = new GameCoordinator(
    options.games ?? defaultGames,
    broadcast,
    (code) => janitor.check(code),
    playersOf,
  );

  const expire = (code: string) => {
    broadcast(code, "all", roomClosed({ reason: "room closed after host inactivity" }, "all"));
    const socketIds = io.sockets.adapter.rooms.get(code);
    if (socketIds) {
      for (const socketId of [...socketIds]) {
        const member = io.sockets.sockets.get(socketId);
        const participantId = member?.data.participantId;
        if (participantId && owners.get(participantId) === socketId) {
          owners.delete(participantId);
        }
        detach(socketId);
      }
    }
    store.removeRoom(code);
    games.dispose(code);
    janitor.disarm(code);
  };

  const janitor = new RoomJanitor(
    store,
    games,
    options.roomTtlMs ?? defaultRoomTtlMs,
    expire,
  );

  const detach = (socketId: string) => {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) return;
    const { roomCode, role } = socket.data;
    if (roomCode) {
      socket.leave(roomCode);
      if (role) socket.leave(roleRoom(roomCode, role));
    }
    socket.data.participantId = null;
    socket.data.roomCode = null;
    socket.data.role = null;
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
        const previous = owners.get(participantId);
        if (previous && previous !== socket.id) detach(previous);
        owners.set(participantId, socket.id);
        socket.data.participantId = participantId;
        socket.data.roomCode = roomCode;
        socket.data.role = role;
        socket.join(roomCode);
        socket.join(roleRoom(roomCode, role));
        janitor.check(roomCode);
      }

      for (const out of result.outbound) emit(out);

      if (result.resumed) {
        for (const message of games.resume(socket.data)) {
          socket.emit("message:outgoing", message);
        }
      }

      if (result.gameAction) {
        for (const message of runGameAction(result.gameAction)) {
          socket.emit("message:outgoing", message);
        }
        if (socket.data.roomCode) janitor.check(socket.data.roomCode);
      }

      if (result.leave && socket.data.roomCode) {
        const code = socket.data.roomCode;
        if (socket.data.participantId) owners.delete(socket.data.participantId);
        socket.leave(code);
        if (socket.data.role) socket.leave(roleRoom(code, socket.data.role));
        socket.data.participantId = null;
        socket.data.roomCode = null;
        socket.data.role = null;
        const view = store.get(code);
        if (!view || Object.keys(view.participants).length === 0) games.dispose(code);
        janitor.check(code);
      }
    });

    socket.on("disconnect", () => {
      const { roomCode, participantId } = socket.data;
      if (!roomCode || !participantId) return;
      if (owners.get(participantId) !== socket.id) return;
      owners.delete(participantId);
      const view = store.setConnected(roomCode, participantId, false);
      if (view) io.to(roomCode).emit("message:outgoing", roomState({ room: view }, "all"));
      janitor.check(roomCode);
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
        janitor.dispose();
        io.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
