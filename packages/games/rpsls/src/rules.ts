export const CLASSIC_GESTURES = ['rock', 'paper', 'scissors'] as const;
export const LIZARD_SPOCK_GESTURES = ['rock', 'paper', 'scissors', 'lizard', 'spock'] as const;

export type Gesture = (typeof LIZARD_SPOCK_GESTURES)[number];

export type Variant = 'classic' | 'lizard-spock';

/**
 * Sheldon's circle. Every gesture beats exactly two others and loses to the
 * other two, so no gesture is dominant no matter how big the room gets.
 *
 *   Scissors cuts Paper - Paper covers Rock - Rock crushes Lizard -
 *   Lizard poisons Spock - Spock smashes Scissors - Scissors decapitates Lizard -
 *   Lizard eats Paper - Paper disproves Spock - Spock vaporizes Rock -
 *   Rock crushes Scissors
 */
const DEFEATS: Record<Gesture, ReadonlyArray<{ loser: Gesture; verb: string }>> = {
  rock: [
    { loser: 'scissors', verb: 'crushes' },
    { loser: 'lizard', verb: 'crushes' },
  ],
  paper: [
    { loser: 'rock', verb: 'covers' },
    { loser: 'spock', verb: 'disproves' },
  ],
  scissors: [
    { loser: 'paper', verb: 'cuts' },
    { loser: 'lizard', verb: 'decapitates' },
  ],
  lizard: [
    { loser: 'spock', verb: 'poisons' },
    { loser: 'paper', verb: 'eats' },
  ],
  spock: [
    { loser: 'scissors', verb: 'smashes' },
    { loser: 'rock', verb: 'vaporizes' },
  ],
};

export const GESTURE_EMOJI: Record<Gesture, string> = {
  rock: '\u{1F5FF}',
  paper: '\u{1F4C4}',
  scissors: '\u{2702}\u{FE0F}',
  lizard: '\u{1F98E}',
  spock: '\u{1F596}',
};

export const GESTURE_LABEL: Record<Gesture, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
  lizard: 'Lizard',
  spock: 'Spock',
};

export function gesturesFor(variant: Variant): readonly Gesture[] {
  return variant === 'classic' ? CLASSIC_GESTURES : LIZARD_SPOCK_GESTURES;
}

export function isGesture(value: unknown, variant: Variant): value is Gesture {
  return typeof value === 'string' && (gesturesFor(variant) as readonly string[]).includes(value);
}

/** True when `attacker` defeats `defender`. */
export function beats(attacker: Gesture, defender: Gesture): boolean {
  return DEFEATS[attacker].some((entry) => entry.loser === defender);
}

/** "Spock vaporizes Rock", or null when the two gestures don't interact. */
export function describe(attacker: Gesture, defender: Gesture): string | null {
  const entry = DEFEATS[attacker].find((candidate) => candidate.loser === defender);
  if (!entry) return null;
  return `${GESTURE_LABEL[attacker]} ${entry.verb} ${GESTURE_LABEL[defender]}`;
}

/** Every rule of the chosen variant, for the "how to play" panel. */
export function ruleBook(variant: Variant): string[] {
  const gestures = gesturesFor(variant);
  const rules: string[] = [];
  for (const attacker of gestures) {
    for (const { loser } of DEFEATS[attacker]) {
      if (!gestures.includes(loser)) continue;
      const line = describe(attacker, loser);
      if (line) rules.push(line);
    }
  }
  return rules;
}
