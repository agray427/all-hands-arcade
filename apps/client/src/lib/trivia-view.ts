import type { GameResults } from "@arcade/core";

export interface TriviaView {
  variant: "classic" | "survival" | "host-paced";
  phase: "question" | "reveal" | "ended";
  round: number;
  totalRounds: number;
  deadline: number;
  timeMs: number;
  question: { prompt: string; choices: string[] };
  answered: string[];
  contestants: string[];
  names: Record<string, string>;
  scores: Record<string, number>;
  eliminatedAt: Record<string, number>;
  correctIndex?: number;
  outcomes?: Record<string, "correct" | "wrong" | "timeout">;
  leaderboard?: GameResults;
}
