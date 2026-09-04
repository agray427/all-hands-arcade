# Cipher

A competitive 5x5 word game for All Hands Arcade. Five letters, five guesses,
three minutes, and a whole room racing the same word.

## How a match runs

1. The **Facilitator** creates a room and gets a four-character join code.
2. Players join from their phones at `/play/<CODE>`.
3. Each round the facilitator picks a secret word (or hits **Random**) and starts
   the clock.
4. Everyone races the same word on their own 5x5 grid.
5. The round ends as soon as every connected player has solved or run out of
   guesses — or at the three-minute buzzer, or when the facilitator ends it.
6. The word is revealed, points are awarded, and the next round begins.

Round count is configurable (1–10, default 3). **Round length is not**: it is
fixed at three minutes because the scoring curve is anchored to it.

## Scoring

Each round is worth up to **1000 points**: 500 for speed, 500 for guesses.

| Solved within | Speed points |     | Solved in | Guess points |
| ------------- | ------------ | --- | --------- | ------------ |
| 15s           | 500          |     | 1 guess   | 500          |
| 45s           | 400          |     | 2 guesses | 400          |
| 90s           | 300          |     | 3 guesses | 300          |
| 135s          | 200          |     | 4 guesses | 200          |
| 180s          | 100          |     | 5 guesses | 100          |

Speed is **interpolated between those anchors**, not bucketed: a solve at 32s is
worth 443 and one at 44s is worth 413. That keeps scores spread out even in a
single-round game, while every published anchor still lands on its exact value.
Set `mode: 'tiered'` if you want the coarse buckets instead.

Consequences worth knowing:

- A perfect round — first guess, inside 15 seconds — is **1000**.
- The worst correct answer — fifth guess, right on the buzzer — is **200**
  (100 + 100). This falls out of the anchors rather than being clamped, and
  `scoring.test.ts` asserts it stays that way.
- Not solving scores **0**. There is no partial credit.
- Elapsed time is always measured server-side as `guess received - round started`.
  The client clock is for display only.

## The allow list

One list of **12,634 five-letter words** governs both roles: it is what a
facilitator may set as the secret and what a player may enter as a guess.
Anything else — a non-word, the wrong length, digits, punctuation — is refused
with exactly one message:

> This is not an allowed word

A refused entry is **never locked in**. It does not consume a guess, does not
appear on the facilitator's wall, and stays in the input so it can be edited.
That is enforced structurally in `submitGuess()`, which validates before it
touches the board, so the server can safely re-check anything the client already
checked.

`ANSWER_POOL` (~1,200 common words, frequency-ordered) is a strict **subset** of
the allow list, used only for the Random button and for ranking autocomplete. It
never narrows what anyone may type.

### Regenerating the word lists

The lists are generated once and committed; nothing fetches anything at build or
run time.

```bash
npm run words:generate --workspace @arcade/cipher
```

Sources, both MIT-licensed: `an-array-of-english-words` (SCOWL-derived) for the
allow list, and `first20hours/google-10000-english` for the common-word subset.
`src/words/blocklist.ts` is hand-maintained and subtracted from both.

## Fair play

- The secret word lives only on the server and in the facilitator's own payload.
  Players are told *that* a word is set, never *what* it is, until the round
  resolves.
- Other players' letters are never broadcast. The facilitator's wall shows
  colour patterns only, via `publicBoard()`.
- Reconnecting requires the server-issued token minted at join, so a dropped
  player resumes their own board and nobody can claim someone else's score.
