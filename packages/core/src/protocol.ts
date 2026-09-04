import type { PlayerId, RoomCode, RoomSnapshot } from './types.js';

/** Result envelope used by every acknowledgement callback. */
export type Ack<T> = ({ ok: true } & T) | { ok: false; error: string };

/** An acknowledgement that carries nothing beyond success or failure. */
export type SimpleAck = { ok: true } | { ok: false; error: string };

export interface HostCreatePayload {
  gameId: string;
  config: unknown;
}

export interface PlayerJoinPayload {
  roomCode: RoomCode;
  name: string;
  /** Present when the tab is re-joining after a refresh or a dropped socket. */
  playerId?: PlayerId;
}

export interface PlayerActionPayload {
  action: unknown;
}

/** Events the client sends. */
export const ClientEvent = {
  HostCreate: 'host:create',
  HostStart: 'host:start',
  HostEnd: 'host:end',
  PlayerJoin: 'player:join',
  PlayerAction: 'player:action',
} as const;

/** Events the server sends. */
export const ServerEvent = {
  Room: 'room:snapshot',
  HostView: 'host:view',
  PlayerView: 'player:view',
  Closed: 'room:closed',
} as const;

export interface ServerToClientEvents {
  [ServerEvent.Room]: (snapshot: RoomSnapshot) => void;
  [ServerEvent.HostView]: (view: unknown) => void;
  [ServerEvent.PlayerView]: (view: unknown) => void;
  [ServerEvent.Closed]: (payload: { reason: string }) => void;
}

export interface ClientToServerEvents {
  [ClientEvent.HostCreate]: (
    payload: HostCreatePayload,
    ack: (result: Ack<{ room: RoomSnapshot }>) => void,
  ) => void;
  [ClientEvent.HostStart]: (ack: (result: SimpleAck) => void) => void;
  [ClientEvent.HostEnd]: (ack: (result: SimpleAck) => void) => void;
  [ClientEvent.PlayerJoin]: (
    payload: PlayerJoinPayload,
    ack: (result: Ack<{ playerId: PlayerId; name: string; room: RoomSnapshot }>) => void,
  ) => void;
  [ClientEvent.PlayerAction]: (payload: PlayerActionPayload) => void;
}
