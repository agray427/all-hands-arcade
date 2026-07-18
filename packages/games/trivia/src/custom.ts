import type { TriviaQuestion } from "./decks.js";

export type ParsedDeck =
  | { ok: true; questions: TriviaQuestion[] }
  | { ok: false; error: string };

export function parseCustomDeck(source: string): ParsedDeck {
  const questions: TriviaQuestion[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const lineNo = i + 1;

    const [prompt, ...choices] = line.split("|").map((part) => part.trim());
    if (!prompt) return { ok: false, error: `line ${lineNo}: missing prompt` };
    if (choices.length < 2 || choices.length > 6) {
      return { ok: false, error: `line ${lineNo}: needs 2 to 6 choices` };
    }

    const texts = choices.map((c) => (c.startsWith("*") ? c.slice(1).trim() : c));
    if (texts.some((c) => c === "")) {
      return { ok: false, error: `line ${lineNo}: empty choice` };
    }
    const starred = choices.filter((c) => c.startsWith("*"));
    if (starred.length !== 1) {
      return {
        ok: false,
        error: `line ${lineNo}: mark exactly one correct choice with a leading *`,
      };
    }

    questions.push({
      prompt,
      choices: texts,
      correctIndex: choices.findIndex((c) => c.startsWith("*")),
    });
  }

  if (questions.length === 0) {
    return { ok: false, error: "custom deck has no questions" };
  }
  return { ok: true, questions };
}
