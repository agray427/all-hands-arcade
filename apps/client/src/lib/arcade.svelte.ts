import { ArcadeSocket } from "./arcade-socket.js";
import {
  roomCreate,
  roomJoin,
  roomLeave,
  type Participant,
  type RoomView,
  type ServerBroadcastEnvelope,
} from "@arcade/core";

interface WelcomePayload {
  room: RoomView;
  youId: string;
}

export class ArcadeClient {
  room = $state<RoomView | null>(null);
  you = $state<Participant | null>(null);
  lastError = $state<string | null>(null);

  roster = $derived.by<Participant[]>(() =>
    this.room ? Object.values(this.room.participants) : [],
  );

  private socket = new ArcadeSocket();

  constructor() {
    this.socket.on("room:state", (payload) => {
      this.room = payload.room;
      if (this.you) this.you = payload.room.participants[this.you.id] ?? this.you;
    });
    this.socket.on("engine:error", (payload) => {
      this.lastError = payload.message;
    });
  }

  async createRoom(hostName: string): Promise<void> {
    this.lastError = null;
    try {
      const res = await this.socket.request(roomCreate({ hostName }));
      this.applyWelcome(res.payload as WelcomePayload);
    } catch (error) {
      this.captureError(error);
    }
  }

  async joinRoom(roomId: string, name: string, asHost: boolean): Promise<void> {
    this.lastError = null;
    try {
      const res = await this.socket.request(roomJoin({ roomId, name, asHost }));
      this.applyWelcome(res.payload as WelcomePayload);
    } catch (error) {
      this.captureError(error);
    }
  }

  leave(): void {
    this.socket.send(roomLeave());
    this.room = null;
    this.you = null;
  }

  private applyWelcome(payload: WelcomePayload): void {
    this.room = payload.room;
    this.you = payload.room.participants[payload.youId] ?? null;
  }

  private captureError(error: unknown): void {
    if (error && typeof error === "object" && "payload" in error) {
      const payload = (error as ServerBroadcastEnvelope).payload as {
        message?: string;
      };
      this.lastError = payload.message ?? "request failed";
    } else if (error instanceof Error) {
      this.lastError = error.message;
    } else {
      this.lastError = "request failed";
    }
  }
}
