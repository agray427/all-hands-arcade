import {
  clampRoundCount,
  fail,
  succeed,
  type Ack,
  type PlayerId,
  type Role,
} from '@arcade/core';
import {
  GAME_ID,
  NOT_ALLOWED_MESSAGE,
  ROUND_DURATION_MS,
  randomAnswer,
  selfBoard,
  submitGuess,
  validateEntry,
  type CipherSessionState,
} from '@arcade/cipher';

import { everyone, facilitators, players, type ArcadeServer, type ArcadeSocket } from '../../io.js';
import { RateLimiter } from '../../lib/rateLimit.js';
import type { Broadcaster } from '../../rooms/broadcast.js';
import type { RoomRegistry } from '../../rooms/registry.js';
import type { RoomRuntime, RoundEndReason } from '../../rooms/room.js';

const GUESS_BUCKET_CAPACITY = 10;
const GUESS_REFILL_PER_SECOND = 1;

export function registerCipher(
  io: ArcadeServer,
  registry: RoomRegistry,
  broadcaster: Broadcaster,
): void {
  const limiters = new WeakMap<ArcadeSocket, RateLimiter>();

  function limiterFor(socket: ArcadeSocket): RateLimiter {
    let limiter = limiters.get(socket);
    if (limiter === undefined) {
      limiter = new RateLimiter(GUESS_BUCKET_CAPACITY, GUESS_REFILL_PER_SECOND);
      limiters.set(socket, limiter);
    }
    return limiter;
  }

  /** Resolve the socket's room, or explain why it has none. */
  function contextOf(socket: ArcadeSocket):
    | { ok: true; room: RoomRuntime; playerId: PlayerId; role: Role }
    | { ok: false; error: ReturnType<typeof fail> } {
    const { roomCode, playerId, role } = socket.data;
    if (roomCode === undefined || playerId === undefined || role === undefined) {
      return { ok: false, error: fail('unauthorized', 'Join a room first') };
    }
    const room = registry.get(roomCode);
    if (room === undefined) {
      return { ok: false, error: fail('room_not_found', 'That room has closed') };
    }
    return { ok: true, room, playerId, role };
  }

  function seat(socket: ArcadeSocket, room: RoomRuntime, playerId: PlayerId, role: Role): void {
    socket.data.roomCode = room.code;
    socket.data.playerId = playerId;
    socket.data.role = role;
    void socket.join(everyone(room.code));
    void socket.join(role === 'facilitator' ? facilitators(room.code) : players(room.code));
  }

  function gameStateFor(room: RoomRuntime, playerId: PlayerId, role: Role): CipherSessionState {
    const board = room.round?.boards.get(playerId);
    const state: CipherSessionState = {
      board: board === undefined ? null : selfBoard(board),
      hasSecret: room.pendingSecret !== null || room.round?.phase === 'active',
    };
    if (role === 'facilitator') {
      // Only the facilitator's own payload ever carries the word.
      state.secret = room.pendingSecret ?? room.round?.secret;
      state.progress = room.progress();
    }
    return state;
  }

  function sessionResult(room: RoomRuntime, playerId: PlayerId, role: Role, token: string) {
    return {
      code: room.code,
      role,
      identity: { playerId, token },
      snapshot: room.snapshot(),
      match: room.matchSnapshot(),
      leaderboard: room.leaderboard(),
      gameState: gameStateFor(room, playerId, role) satisfies CipherSessionState,
    };
  }

  function announce(room: RoomRuntime): void {
    io.to(everyone(room.code)).emit('room:snapshot', room.snapshot());
  }

  // ---- round lifecycle ----------------------------------------------------

  function finishRound(room: RoomRuntime, reason: RoundEndReason): void {
    const outcome = room.endRound();
    if (outcome === null) return;

    io.to(everyone(room.code)).emit('cipher:reveal', {
      index: room.currentRoundIndex,
      secret: outcome.secret,
      solvedBy: outcome.solvedBy,
    });
    io.to(everyone(room.code)).emit('round:resolved', {
      index: room.currentRoundIndex,
      leaderboard: room.leaderboard(),
      matchComplete: room.status === 'match_complete',
    });
    io.to(everyone(room.code)).emit('match:state', room.matchSnapshot());
    broadcaster.flushProgress(room.code);
    broadcaster.flushLeaderboard(room.code);
    announce(room);
    void reason;
  }

  function beginRound(room: RoomRuntime): void {
    const round = room.startRound();

    room.clearTimer();
    room.timer = setTimeout(() => finishRound(room, 'time_up'), ROUND_DURATION_MS);

    const window = room.matchSnapshot().rounds[round.index];
    if (window !== undefined) io.to(everyone(room.code)).emit('round:started', window);
    io.to(everyone(room.code)).emit('match:state', room.matchSnapshot());
    io.to(players(room.code)).emit('cipher:secretReady', { hasSecret: true });
    announce(room);
    broadcaster.flushProgress(room.code);
  }

  // ---- connection ---------------------------------------------------------

  io.on('connection', (socket: ArcadeSocket) => {
    socket.on('time:sync', (_clientSentAt, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    socket.on('room:create', (req, ack: Ack<ReturnType<typeof sessionResult>>) => {
      if (typeof ack !== 'function') return;
      if (req?.gameId !== undefined && req.gameId !== GAME_ID) {
        ack(fail('bad_request', 'Unknown game'));
        return;
      }
      const room = registry.create(clampRoundCount(req?.roundCount ?? 3));
      const runtime = room.add(req?.displayName ?? 'Facilitator', 'facilitator');
      seat(socket, room, runtime.participant.id, 'facilitator');
      ack(succeed(sessionResult(room, runtime.participant.id, 'facilitator', runtime.token)));
    });

    socket.on('room:join', (req, ack: Ack<ReturnType<typeof sessionResult>>) => {
      if (typeof ack !== 'function') return;
      const room = registry.get(req?.code ?? '');
      if (room === undefined) {
        ack(fail('room_not_found', 'No game with that code'));
        return;
      }
      if (registry.isFull(room)) {
        ack(fail('room_full', 'That game is full'));
        return;
      }
      const runtime = room.add(req?.displayName ?? 'Player', 'player');
      seat(socket, room, runtime.participant.id, 'player');

      io.to(everyone(room.code)).emit('room:participant', { ...runtime.participant });
      announce(room);
      broadcaster.markLeaderboardDirty(room.code);
      ack(succeed(sessionResult(room, runtime.participant.id, 'player', runtime.token)));
    });

    socket.on('room:resume', (req, ack: Ack<ReturnType<typeof sessionResult>>) => {
      if (typeof ack !== 'function') return;
      const room = registry.get(req?.code ?? '');
      if (room === undefined) {
        ack(fail('room_not_found', 'That game has ended'));
        return;
      }
      const runtime = room.authenticate(req?.identity?.playerId, req?.identity?.token ?? '');
      if (runtime === null) {
        // Token mismatch: someone else's playerId, or a stale tab from a
        // previous match. Either way, no seat.
        ack(fail('unauthorized', 'Could not restore that session'));
        return;
      }

      runtime.participant.connected = true;
      runtime.disconnectedAt = null;
      runtime.socketId = socket.id;
      seat(socket, room, runtime.participant.id, runtime.participant.role);
      room.touch();

      // Re-send private board so the grid comes back exactly as they left it.
      const board = room.round?.boards.get(runtime.participant.id);
      if (board !== undefined) socket.emit('cipher:board', selfBoard(board));

      io.to(everyone(room.code)).emit('room:participant', { ...runtime.participant });
      announce(room);
      ack(
        succeed(
          sessionResult(room, runtime.participant.id, runtime.participant.role, runtime.token),
        ),
      );
    });

    socket.on('match:start', (ack: Ack<null>) => {
      if (typeof ack !== 'function') return;
      const ctx = contextOf(socket);
      if (!ctx.ok) {
        ack(ctx.error);
        return;
      }
      if (ctx.role !== 'facilitator') {
        ack(fail('not_facilitator', 'Only the facilitator can start a round'));
        return;
      }
      if (!ctx.room.canStartRound()) {
        ack(
          fail(
            'invalid_state',
            ctx.room.pendingSecret === null
              ? 'Choose a word first'
              : 'There is no round left to start',
          ),
        );
        return;
      }
      beginRound(ctx.room);
      ack(succeed(null));
    });

    socket.on('round:advance', (ack: Ack<null>) => {
      if (typeof ack !== 'function') return;
      const ctx = contextOf(socket);
      if (!ctx.ok) {
        ack(ctx.error);
        return;
      }
      if (ctx.role !== 'facilitator') {
        ack(fail('not_facilitator', 'Only the facilitator can end a round'));
        return;
      }
      if (ctx.room.round === null || ctx.room.round.phase !== 'active') {
        ack(fail('invalid_state', 'No round is running'));
        return;
      }
      finishRound(ctx.room, 'facilitator');
      ack(succeed(null));
    });

    socket.on('cipher:setSecret', (req, ack: Ack<{ word: string }>) => {
      if (typeof ack !== 'function') return;
      const ctx = contextOf(socket);
      if (!ctx.ok) {
        ack(ctx.error);
        return;
      }
      if (ctx.role !== 'facilitator') {
        ack(fail('not_facilitator', 'Only the facilitator can set the word'));
        return;
      }
      if (ctx.room.status === 'in_round') {
        ack(fail('invalid_state', 'A round is already running'));
        return;
      }

      // Exactly the same gate a player's guess goes through, so the facilitator
      // sees the same message for the same reason.
      const entry = validateEntry(req?.word ?? '');
      if (!entry.ok) {
        ack(fail('invalid_entry', NOT_ALLOWED_MESSAGE));
        return;
      }

      ctx.room.pendingSecret = entry.word;
      ctx.room.touch();
      io.to(players(ctx.room.code)).emit('cipher:secretReady', { hasSecret: true });
      ack(succeed({ word: entry.word }));
    });

    socket.on('cipher:randomSecret', (ack: Ack<{ word: string }>) => {
      if (typeof ack !== 'function') return;
      const ctx = contextOf(socket);
      if (!ctx.ok) {
        ack(ctx.error);
        return;
      }
      if (ctx.role !== 'facilitator') {
        ack(fail('not_facilitator', 'Only the facilitator can set the word'));
        return;
      }
      if (ctx.room.status === 'in_round') {
        ack(fail('invalid_state', 'A round is already running'));
        return;
      }
      const word = randomAnswer();
      ctx.room.pendingSecret = word;
      ctx.room.touch();
      io.to(players(ctx.room.code)).emit('cipher:secretReady', { hasSecret: true });
      ack(succeed({ word }));
    });

    socket.on('cipher:guess', (req, ack) => {
      if (typeof ack !== 'function') return;
      const ctx = contextOf(socket);
      if (!ctx.ok) {
        ack(ctx.error);
        return;
      }
      if (!limiterFor(socket).tryConsume()) {
        ack(fail('rate_limited', 'Slow down a moment'));
        return;
      }
      const round = ctx.room.round;
      if (round === null || round.phase !== 'active') {
        ack(fail('invalid_state', 'No round is running'));
        return;
      }

      // Server clock only. A client that lies about its timing changes nothing.
      const outcome = submitGuess(round, ctx.playerId, req?.guess ?? '', Date.now());
      if (outcome.kind === 'rejected') {
        const code = outcome.reason === 'not_allowed' ||
          outcome.reason === 'wrong_length' ||
          outcome.reason === 'non_alpha'
          ? 'invalid_entry'
          : 'invalid_state';
        ack(fail(code, outcome.message));
        return;
      }

      ctx.room.touch();
      ack(
        succeed({
          guessIndex: outcome.guessIndex,
          result: outcome.result,
          solved: outcome.solved,
          points: outcome.board.score?.total ?? null,
        }),
      );

      broadcaster.markProgressDirty(ctx.room.code);
      if (outcome.solved) broadcaster.markLeaderboardDirty(ctx.room.code);

      // Nobody left to play: end the round now rather than watch a dead clock.
      if (ctx.room.shouldEndEarly()) finishRound(ctx.room, 'all_finished');
    });

    socket.on('room:leave', (ack: Ack<null>) => {
      const ctx = contextOf(socket);
      if (ctx.ok) {
        ctx.room.markDisconnected(ctx.playerId);
        announce(ctx.room);
      }
      socket.data.roomCode = undefined;
      socket.data.playerId = undefined;
      socket.data.role = undefined;
      if (typeof ack === 'function') ack(succeed(null));
    });

    socket.on('disconnect', () => {
      const { roomCode, playerId } = socket.data;
      if (roomCode === undefined || playerId === undefined) return;
      const room = registry.get(roomCode);
      if (room === undefined) return;

      room.markDisconnected(playerId);
      const runtime = room.participants.get(playerId);
      if (runtime !== undefined) {
        io.to(everyone(room.code)).emit('room:participant', { ...runtime.participant });
      }

      // A drop can be the last thing a round was waiting on.
      if (room.shouldEndEarly()) finishRound(room, 'all_finished');
    });
  });
}
