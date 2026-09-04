export {
  DEFAULT_ROUND_COUNT,
  GAME_ID,
  GAME_NAME,
  MAX_GUESSES,
  NOT_ALLOWED_MESSAGE,
  ROUND_DURATION_MS,
  WORD_LENGTH,
} from './constants.js';

export { evaluateGuess, isWinningResult, mergeKeyboardStates } from './evaluate.js';
export type { LetterState } from './evaluate.js';

export { normalizeEntry, validateEntry } from './validate.js';
export type { EntryRejection, EntryResult } from './validate.js';

export {
  GUESS_ANCHORS,
  MAX_GUESS_POINTS,
  MAX_ROUND_POINTS,
  MAX_SPEED_POINTS,
  MIN_CORRECT_ROUND_POINTS,
  SPEED_ANCHORS,
  guessPoints,
  scoreRound,
  speedPoints,
} from './scoring.js';
export type {
  RoundScoreBreakdown,
  RoundScoreInput,
  ScoreMode,
  SpeedAnchor,
} from './scoring.js';

export {
  allBoardsFinished,
  createBoard,
  createRound,
  isBoardFinished,
  resolveRound,
  submitGuess,
} from './state.js';
export type { CipherRoundState, PlayerBoard, SubmitOutcome } from './state.js';

export { publicBoard, selfBoard } from './redact.js';
export type { PublicBoard, SelfBoard } from './redact.js';

export {
  allowedWordCount,
  allowedWords,
  answerPool,
  isAllowedWord,
  randomAnswer,
  suggestWords,
} from './words/index.js';

export type {
  CipherC2S,
  CipherClientToServer,
  CipherS2C,
  CipherServerToClient,
  CipherSessionState,
  GuessAccepted,
} from './events.js';
