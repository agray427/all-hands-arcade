import { io, type Socket } from "socket.io-client";
import type { BaseMessage, ServerBroadcastEnvelope } from "@arcade/core";

interface ServerToClientEvents {
  "message:outgoing": (message: ServerBroadcastEnvelope) => void;
}

interface ClientToServerEvents {
  "message:incoming": (raw: BaseMessage) => void;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

export function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io(SERVER_URL, { autoConnect: true });
  }
  return socket;
}
