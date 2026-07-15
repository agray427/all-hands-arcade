import { ArcadeSocket } from "./arcade-socket.js";
import {
  envelope,
  gameEnd,
  gameList,
  gameStart,
  roomCreate,
  roomJoin,
  roomLeave,
  type GameCatalog,
  type GameConfig,
  type GameResults,
  type Participant,
  type RoomView,
  type ServerBroadcastEnvelope,
} from "@arcade/core";
import type { TriviaView } from "./trivia-view.js";

interface WelcomePayload {
  room: RoomView;
  youId: string;
}

export interface ActiveGame {
  gameId: string;
  view: TriviaView;
}

export class ArcadeClient {
  room = $state<RoomView | null>(null);
  you = $state<Participant | null>(null);
  lastError = $state<string | null>(null);
  catalog = $state<GameCatalog | null>(null);
  game = $state<ActiveGame | null>(null);
  results = $state<GameResults | null>(null);
  myChoice = $state<number | null>(null);

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
    this.socket.on("game:started", () => {
      this.results = null;
      this.myChoice = null;
    });
    this.socket.on("game:state", (payload) => {
      const view = payload.view as TriviaView;
      if (
        view.phase === "question" &&
        (!this.game || this.game.view.round !== view.round)
      ) {
        this.myChoice = null;
      }
      this.game = { gameId: payload.gameId, view };
    });
    this.socket.on("game:ended", (payload) => {
      this.results = payload.results;
      this.game = null;
      this.myChoice = null;
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

  async joinRoom(roomCode: string, name: string, asHost: boolean): Promise<void> {
    this.lastError = null;
    try {
      const res = await this.socket.request(roomJoin({ roomCode, name, asHost }));
      this.applyWelcome(res.payload as WelcomePayload);
    } catch (error) {
      this.captureError(error);
    }
  }

  leave(): void {
    this.socket.send(roomLeave());
    this.room = null;
    this.you = null;
    this.game = null;
    this.results = null;
    this.myChoice = null;
  }

  async loadCatalog(): Promise<void> {
    try {
      const res = await this.socket.request(gameList());
      this.catalog = (res.payload as { games: GameCatalog }).games;
    } catch (error) {
      this.captureError(error);
    }
  }

  async startGame(gameId: string, variantId?: string, config?: GameConfig): Promise<void> {
    this.lastError = null;
    try {
      await this.socket.request(gameStart({ gameId, variantId, config }));
    } catch (error) {
      this.captureError(error);
    }
  }

  endGame(): void {
    this.socket.send(gameEnd());
  }

  submitAnswer(choice: number): void {
    if (!this.game || this.myChoice !== null) return;
    this.myChoice = choice;
    this.socket.send(envelope("answer:submit", { choice }, { gameId: this.game.gameId }));
  }

  dismissResults(): void {
    this.results = null;
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
