import {
  engineError,
  gameCatalog,
  gameEnded,
  gameStarted,
  gameState,
  resolveConfig,
  toCatalog,
  validatePayload,
  type AnyGameDefinition,
  type BaseMessage,
  type EngineErrorCode,
  type GameAudience,
  type GameConfig,
  type GameContext,
  type GameStartPayload,
  type Participant,
  type ReduceResult,
  type ServerBroadcastEnvelope,
  type TargetAudience,
} from "@arcade/core";
import type { ConnectionContext } from "./router.js";

export type GameEmitter = (
  roomCode: string,
  target: TargetAudience,
  message: ServerBroadcastEnvelope,
) => void;

interface GameSession {
  definition: AnyGameDefinition;
  variantId: string;
  config: GameConfig;
  state: unknown;
  timers: Map<string, ReturnType<typeof setTimeout>>;
  ctx: GameContext;
}

type SelfReplies = ServerBroadcastEnvelope[];

function error(code: EngineErrorCode, message: string, replyTo?: string): SelfReplies {
  return [engineError({ code, message }, "self", replyTo)];
}

export class GameCoordinator {
  private registry: Map<string, AnyGameDefinition>;
  private sessions = new Map<string, GameSession>();

  constructor(
    definitions: AnyGameDefinition[],
    private emit: GameEmitter,
    private onDispose?: (roomCode: string) => void,
  ) {
    this.registry = new Map(definitions.map((d) => [d.id, d]));
  }

  list(replyTo?: string): SelfReplies {
    return [gameCatalog({ games: toCatalog([...this.registry.values()]) }, "self", replyTo)];
  }

  hasSession(roomCode: string): boolean {
    return this.sessions.has(roomCode);
  }

  resume(ctx: ConnectionContext): SelfReplies {
    if (!ctx.roomCode || !ctx.role) return [];
    const session = this.sessions.get(ctx.roomCode);
    if (!session) return [];
    const audience: GameAudience = ctx.role === "host" ? "host" : "player";
    return [
      gameStarted(
        {
          gameId: session.definition.id,
          variantId: session.variantId,
          config: session.config,
        },
        "self",
      ),
      gameState(
        {
          gameId: session.definition.id,
          view: session.definition.view(session.state, audience),
        },
        "self",
      ),
    ];
  }

  start(
    ctx: ConnectionContext,
    payload: GameStartPayload,
    players: Participant[],
    replyTo?: string,
  ): SelfReplies {
    if (!ctx.roomCode || ctx.role !== "host") {
      return error("NOT_ALLOWED", "only a host in a room can start a game", replyTo);
    }
    if (this.sessions.has(ctx.roomCode)) {
      return error("GAME_ALREADY_ACTIVE", "a game is already running in this room", replyTo);
    }
    const definition = this.registry.get(payload.gameId);
    if (!definition) {
      return error("NO_SUCH_GAME", `no game registered: ${payload.gameId}`, replyTo);
    }
    const resolved = resolveConfig(definition, payload.variantId, payload.config);
    if (!resolved.ok) {
      return error(resolved.code, resolved.error, replyTo);
    }
    if (players.length < definition.minPlayers) {
      return error(
        "NOT_ALLOWED",
        `${definition.name} needs at least ${definition.minPlayers} player(s)`,
        replyTo,
      );
    }

    const gameCtx: GameContext = { players, now: Date.now, random: Math.random };
    const session: GameSession = {
      definition,
      variantId: resolved.variantId,
      config: resolved.config,
      state: null,
      timers: new Map(),
      ctx: gameCtx,
    };
    this.sessions.set(ctx.roomCode, session);

    this.emit(
      ctx.roomCode,
      "all",
      gameStarted(
        { gameId: definition.id, variantId: resolved.variantId, config: resolved.config },
        "all",
        replyTo,
      ),
    );
    this.apply(ctx.roomCode, session, session.definition.setup(resolved.variantId, resolved.config, gameCtx));
    return [];
  }

  end(ctx: ConnectionContext, replyTo?: string): SelfReplies {
    if (!ctx.roomCode || ctx.role !== "host") {
      return error("NOT_ALLOWED", "only a host in a room can end a game", replyTo);
    }
    const session = this.sessions.get(ctx.roomCode);
    if (!session) return error("NO_ACTIVE_GAME", "no game is running in this room", replyTo);
    this.finish(ctx.roomCode, session);
    return [];
  }

  message(ctx: ConnectionContext, msg: BaseMessage): SelfReplies {
    if (!ctx.roomCode || !ctx.participantId || !ctx.role) {
      return error("NOT_ALLOWED", "join a room first", msg.messageId);
    }
    const session = this.sessions.get(ctx.roomCode);
    if (!session) {
      if (msg.gameId && !this.registry.has(msg.gameId)) {
        return error("NO_SUCH_GAME", `no game registered: ${msg.gameId}`, msg.messageId);
      }
      return error("NO_ACTIVE_GAME", "no game is running in this room", msg.messageId);
    }
    if (msg.gameId !== session.definition.id) {
      return error(
        "NO_ACTIVE_GAME",
        `the active game is ${session.definition.id}, not ${msg.gameId}`,
        msg.messageId,
      );
    }
    const spec = session.definition.messages[msg.type];
    if (!spec) {
      return error(
        "MALFORMED_MESSAGE",
        `unknown ${session.definition.id} message: ${msg.type}`,
        msg.messageId,
      );
    }
    const valid = validatePayload(spec, msg.payload);
    if (!valid.ok) return error("MALFORMED_MESSAGE", valid.error, msg.messageId);

    const result = session.definition.reduce(
      session.state,
      {
        kind: "message",
        type: msg.type,
        payload: msg.payload,
        from: ctx.participantId,
        role: ctx.role,
        messageId: msg.messageId,
      },
      session.ctx,
    );
    this.apply(ctx.roomCode, session, result);
    return [];
  }

  dispose(roomCode: string): void {
    const session = this.sessions.get(roomCode);
    if (!session) return;
    for (const timer of session.timers.values()) clearTimeout(timer);
    this.sessions.delete(roomCode);
    this.onDispose?.(roomCode);
  }

  private onTimer(roomCode: string, timerId: string): void {
    const session = this.sessions.get(roomCode);
    if (!session) return;
    session.timers.delete(timerId);
    this.apply(roomCode, session, session.definition.reduce(session.state, { kind: "timer", id: timerId }, session.ctx));
  }

  private apply(roomCode: string, session: GameSession, result: ReduceResult<unknown>): void {
    session.state = result.state;
    let ended = false;

    for (const effect of result.effects ?? []) {
      switch (effect.kind) {
        case "schedule": {
          const timer = setTimeout(() => this.onTimer(roomCode, effect.id), effect.delayMs);
          session.timers.set(effect.id, timer);
          break;
        }
        case "cancel": {
          const timer = session.timers.get(effect.id);
          if (timer) clearTimeout(timer);
          session.timers.delete(effect.id);
          break;
        }
        case "end":
          ended = true;
          break;
      }
    }

    this.broadcastState(roomCode, session);
    if (ended) this.finish(roomCode, session);
  }

  private broadcastState(roomCode: string, session: GameSession): void {
    const send = (audience: GameAudience, target: TargetAudience) => {
      this.emit(
        roomCode,
        target,
        gameState(
          { gameId: session.definition.id, view: session.definition.view(session.state, audience) },
          target,
        ),
      );
    };
    send("host", "host");
    send("player", "players");
  }

  private finish(roomCode: string, session: GameSession): void {
    this.emit(
      roomCode,
      "all",
      gameEnded(
        { gameId: session.definition.id, results: session.definition.results(session.state) },
        "all",
      ),
    );
    this.dispose(roomCode);
  }
}
