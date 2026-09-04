import { WORD_LENGTH } from '../constants.js';
import { ALLOWED_BLOB, ALLOWED_COUNT } from './allowed.generated.js';
import { ANSWER_BLOB, ANSWER_COUNT } from './answers.generated.js';

/**
 * The allow list is stored as one fixed-width blob and expanded lazily into a
 * Set on first use. Building 12.6k entries takes a few milliseconds, paid once
 * per server process or browser tab, and never on a path a player is waiting on.
 */
let allowedSet: Set<string> | undefined;

function sliceBlob(blob: string, count: number): string[] {
  const out = new Array<string>(count);
  for (let i = 0; i < count; i += 1) {
    // slice() returns string; blob[i] would be string|undefined under
    // noUncheckedIndexedAccess and force pointless guards.
    out[i] = blob.slice(i * WORD_LENGTH, (i + 1) * WORD_LENGTH);
  }
  return out;
}

function getAllowedSet(): Set<string> {
  if (allowedSet === undefined) {
    allowedSet = new Set(sliceBlob(ALLOWED_BLOB, ALLOWED_COUNT));
  }
  return allowedSet;
}

let answerList: string[] | undefined;

function getAnswerList(): string[] {
  if (answerList === undefined) {
    answerList = sliceBlob(ANSWER_BLOB, ANSWER_COUNT);
  }
  return answerList;
}

/** The single allow list. Governs both facilitator picks and player guesses. */
export function isAllowedWord(word: string): boolean {
  return getAllowedSet().has(word);
}

export function allowedWordCount(): number {
  return ALLOWED_COUNT;
}

export function allowedWords(): readonly string[] {
  return sliceBlob(ALLOWED_BLOB, ALLOWED_COUNT);
}

/**
 * Common words only, so the facilitator's "random" button never lands on
 * something nobody can guess. A strict subset of the allow list.
 */
export function answerPool(): readonly string[] {
  return getAnswerList();
}

export function randomAnswer(random: () => number = Math.random): string {
  const pool = getAnswerList();
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)));
  return pool[index] ?? 'about';
}

/**
 * Autocomplete for the facilitator's word picker. Common words rank first so
 * the obvious choice is the first suggestion, then the rest of the allow list
 * alphabetically.
 */
export function suggestWords(prefix: string, limit = 8): string[] {
  const needle = prefix.trim().toLowerCase();
  if (needle.length === 0) return [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const word of getAnswerList()) {
    if (out.length >= limit) return out;
    if (word.startsWith(needle) && !seen.has(word)) {
      seen.add(word);
      out.push(word);
    }
  }

  for (let i = 0; i < ALLOWED_COUNT && out.length < limit; i += 1) {
    const word = ALLOWED_BLOB.slice(i * WORD_LENGTH, (i + 1) * WORD_LENGTH);
    if (word.startsWith(needle) && !seen.has(word)) {
      seen.add(word);
      out.push(word);
    }
  }

  return out;
}
