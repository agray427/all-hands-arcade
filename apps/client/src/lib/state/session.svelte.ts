import type { Identity } from '@arcade/core';

/**
 * Identity is stored per room code so a refresh, a dropped connection or a
 * closed tab returns to the same seat, board and score rather than creating a
 * duplicate player. Scoped per code so two rooms in two tabs do not collide.
 */
const key = (code: string): string => `arcade:cipher:${code.toUpperCase()}`;

export function loadIdentity(code: string): Identity | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'playerId' in parsed &&
      'token' in parsed
    ) {
      return parsed as Identity;
    }
    return null;
  } catch {
    // Private browsing, cleared storage, or corrupt JSON: start fresh.
    return null;
  }
}

export function saveIdentity(code: string, identity: Identity): void {
  try {
    localStorage.setItem(key(code), JSON.stringify(identity));
  } catch {
    // Non-fatal: the player just loses reconnect-resume for this tab.
  }
}

export function clearIdentity(code: string): void {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}

const NAME_KEY = 'arcade:cipher:name';

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
