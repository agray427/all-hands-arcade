import type { ArcadeSocketData, RoomCode } from '@arcade/core';
import type { CipherC2S, CipherS2C } from '@arcade/cipher';
import type { Server, Socket } from 'socket.io';

/**
 * The platform contract intersected with the game's. Both apps import the same
 * aliases from @arcade/cipher, so an event can never exist on one side only.
 *
 * Note socket.io's server generics are <Listen, Emit, ...> — the mirror image
 * of the client's — so C2S comes first here and second on the client.
 */
export type ArcadeServer = Server<CipherC2S, CipherS2C, Record<string, never>, ArcadeSocketData>;
export type ArcadeSocket = Socket<CipherC2S, CipherS2C, Record<string, never>, ArcadeSocketData>;

export const everyone = (code: RoomCode): string => `room:${code}`;
export const facilitators = (code: RoomCode): string => `room:${code}:fac`;
export const players = (code: RoomCode): string => `room:${code}:players`;
