import type { PlayerId } from './ids.js';

export interface RoundScore {
  playerId: PlayerId;
  roundIndex: number;
  points: number;
  /** Per-game breakdown, e.g. `{ speed: 443, guesses: 400 }`. Display only. */
  detail?: Record<string, number>;
}

export interface LeaderboardEntry {
  playerId: PlayerId;
  displayName: string;
  totalPoints: number;
  /** Length `roundCount`; rounds not yet played (or not played by this player) are 0. */
  roundPoints: number[];
  /** 1-based. Tied players share a rank; the next rank skips accordingly. */
  rank: number;
}

/**
 * Fold per-round scores into a ranked leaderboard. Generic on purpose: any
 * game that emits `RoundScore[]` gets ranking, tie handling and per-round
 * columns for free.
 */
export function accumulate(
  scores: readonly RoundScore[],
  names: ReadonlyMap<PlayerId, string>,
  roundCount: number,
): LeaderboardEntry[] {
  const byPlayer = new Map<PlayerId, LeaderboardEntry>();

  const ensure = (playerId: PlayerId): LeaderboardEntry => {
    const existing = byPlayer.get(playerId);
    if (existing) return existing;
    const created: LeaderboardEntry = {
      playerId,
      displayName: names.get(playerId) ?? 'Player',
      totalPoints: 0,
      roundPoints: new Array<number>(roundCount).fill(0),
      rank: 0,
    };
    byPlayer.set(playerId, created);
    return created;
  };

  // Seed every known participant so the board shows the full room from round 1.
  for (const [playerId] of names) ensure(playerId);

  for (const score of scores) {
    const entry = ensure(score.playerId);
    entry.totalPoints += score.points;
    if (score.roundIndex >= 0 && score.roundIndex < roundCount) {
      entry.roundPoints[score.roundIndex] = score.points;
    }
  }

  return rank([...byPlayer.values()]);
}

/** Sort by points desc, then name asc for a stable, non-arbitrary tiebreak. */
export function rank(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const sorted = [...entries].sort(
    (a, b) => b.totalPoints - a.totalPoints || a.displayName.localeCompare(b.displayName),
  );

  let lastPoints: number | null = null;
  let lastRank = 0;
  sorted.forEach((entry, index) => {
    if (lastPoints !== null && entry.totalPoints === lastPoints) {
      entry.rank = lastRank;
    } else {
      entry.rank = index + 1;
      lastRank = entry.rank;
      lastPoints = entry.totalPoints;
    }
  });

  return sorted;
}
