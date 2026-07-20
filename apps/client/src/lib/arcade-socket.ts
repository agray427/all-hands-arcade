import { getSocket } from "./socket.js";
import type {
  BaseMessage,
  ServerBroadcastEnvelope,
  ServerMessageMap,
} from "@arcade/core";

type Listener = (payload: unknown, envelope: ServerBroadcastEnvelope) => void;

interface Pending {
  resolve: (message: ServerBroadcastEnvelope) => void;
  reject: (reason: unknown) => void;
}

export class ArcadeSocket {
  private socket = getSocket();
  private pending = new Map<string, Pending>();
  private listeners = new Map<string, Set<Listener>>();

  constructor() {
    this.socket.on("message:outgoing", (message) => this.dispatch(message));
  }

  private dispatch(message: ServerBroadcastEnvelope): void {
    if (message.replyTo) {
      const waiter = this.pending.get(message.replyTo);
      if (waiter) {
        this.pending.delete(message.replyTo);
        if (message.type === "engine:error") waiter.reject(message);
        else waiter.resolve(message);
      }
    }
    const set = this.listeners.get(message.type);
    if (set) for (const handler of set) handler(message.payload, message);
  }

  get isConnected(): boolean {
    return this.socket.connected === true;
  }

  onStatus(handler: (connected: boolean) => void): () => void {
    const up = () => handler(true);
    const down = () => handler(false);
    this.socket.on("connect", up);
    this.socket.on("disconnect", down);
    return () => {
      this.socket.off("connect", up);
      this.socket.off("disconnect", down);
    };
  }

  send(message: BaseMessage): void {
    this.socket.emit("message:incoming", message);
  }

  request(message: BaseMessage, timeoutMs = 5000): Promise<ServerBroadcastEnvelope> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error(`request timed out: ${message.type}`));
      }, timeoutMs);
      this.pending.set(message.id, {
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
        reject: (reason) => {
          clearTimeout(timer);
          reject(reason);
        },
      });
      this.send(message);
    });
  }

  on<K extends keyof ServerMessageMap & string>(
    type: K,
    handler: (payload: ServerMessageMap[K], envelope: ServerBroadcastEnvelope) => void,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const listener = handler as Listener;
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }
}
