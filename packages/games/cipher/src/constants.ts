export const GAME_ID = 'cipher';
export const GAME_NAME = 'Cipher';

/** 5 letters, 5 guesses — the "5x5" of the game. */
export const WORD_LENGTH = 5;
export const MAX_GUESSES = 5;

/**
 * Fixed at three minutes and deliberately NOT configurable.
 *
 * SPEED_ANCHORS in scoring.ts are absolute second marks (15/45/90/135/180)
 * that terminate exactly at this duration. Parameterising the round length
 * would silently rescale every score without anyone noticing, so if you need a
 * different length you must redesign the anchors too.
 */
export const ROUND_DURATION_MS = 180_000;

export const DEFAULT_ROUND_COUNT = 3;

/**
 * The one error string the spec calls for. Facilitator word picker and player
 * guess box both show exactly this, for every kind of bad entry. Imported by
 * the server, the client and the tests — never retyped.
 */
export const NOT_ALLOWED_MESSAGE = 'This is not an allowed word';
