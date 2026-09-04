# all-hands-arcade

An open-source, extensible multiplayer game platform designed for large teams and enterprise events. Host real-time, browser-based party games for 100+ concurrent players.

One shared screen runs the host dashboard, everyone else plays on their phone. No installs, no accounts, no waiting your turn.

## Quick start

```bash
npm install
npm run dev
```

That starts the Socket.io host on `http://localhost:3001` and the SvelteKit client on `http://localhost:5173`.

- **Host:** open `/host`, set the game up, and put the four-letter room code on the big screen.
- **Players:** open `/play`, enter the code and a name. `/play?code=ABCD` skips the first step.

Copy `.env.example` to `.env` in `apps/server` and `apps/client` to change ports or the CORS origin.

```bash
npm run build   # build every workspace
npm run check   # typecheck server, client and packages
npm run test    # game-logic tests
```

## Games

### Rock Paper Scissors Lizard Spock

Straightforward to run and impossible to deadlock. The host picks the number of rounds and how long
each one lasts; every round the whole room throws at the same time and **you score one point for
every player your gesture beats**.

That scoring is the whole trick. Head-to-head Rock Paper Scissors stalls the moment a room is bigger
than two people — with 200 players in a room, somebody always ties. Scoring against the entire room
instead means a round always separates the field: throwing the gesture that 40% of the room just lost
to is worth 40% of the room. Players who let the clock run out score nothing and are not counted as
opponents, so going idle never hands the room free points.

Host options:

| Option | Default | Range |
| --- | --- | --- |
| Rounds | 5 | 1-25 |
| Seconds to choose | 15 | 5-60 |
| Seconds on the results | 6 | 3-20 |
| Variant | Lizard & Spock | also `classic` (Rock, Paper, Scissors only) |

The Lizard & Spock variant is the Big Bang Theory one, with all ten of Sheldon's rules:

> Scissors cuts Paper - Paper covers Rock - Rock crushes Lizard - Lizard poisons Spock -
> Spock smashes Scissors - Scissors decapitates Lizard - Lizard eats Paper - Paper disproves Spock -
> Spock vaporizes Rock - Rock crushes Scissors

Each gesture beats exactly two others and loses to the other two, so no gesture is dominant however
big the room gets. A round closes early once everyone has thrown, so small rooms never stare at a
timer nobody is waiting on.

## Repository layout

| Path | What it is |
| --- | --- |
| `apps/server` | Socket.io host: rooms, player identity, the tick loop that drives every game |
| `apps/client` | SvelteKit host dashboard and player UI |
| `packages/core` | Isomorphic domain models, the `GameModule` contract, and the socket event protocol |
| `packages/games/rpsls` | Rock Paper Scissors Lizard Spock |

## Adding a game

A game is a `GameModule` from `@arcade/core`: pure functions over its own state, with no knowledge of
sockets or rooms. Implement `create`, `submit`, `tick`, `hostView`, `playerView`, `isOver` and
`leaderboard`, bump `state.version` whenever something changes, and register the module in
`apps/server/src/games.ts`.

The runtime does the rest: it ticks every 250ms, and re-broadcasts a view only when that view actually
changed. Two details matter at all-hands scale:

- **Keep views small.** `hostView` and `playerView` are what goes over the wire. Trim leaderboards and
  per-round tables to what the screen shows; a 300-player room should not ship 300 rows to 300 phones.
- **Trust nothing from a client.** `parseConfig` clamps host input and `submit` receives `unknown` —
  validate it and return the state unchanged if it does not check out.
