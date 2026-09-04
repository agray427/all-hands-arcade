# all-hands-arcade
An open-source, extensible multiplayer game platform designed for large teams and enterprise events. Host real-time, browser-based party games for 100+ concurrent players.

## Getting started

```bash
npm install
npm run build
npm test            # pure-logic tests (scoring, word list, guess evaluation)
npm run check       # typecheck + svelte-check

cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
npm run dev         # server on :3001, client on :5173
```

Open http://localhost:5173, host a game, and join from another tab or a phone on
the same network.

## Layout

| Path                    | What it is                                                        |
| ----------------------- | ----------------------------------------------------------------- |
| `packages/core`         | `@arcade/core` — rooms, roles, join codes, leaderboards, the socket event contract. Game-agnostic. |
| `packages/games/cipher` | `@arcade/cipher` — the first game: a competitive 5x5 word race. See its [README](packages/games/cipher/README.md). |
| `apps/server`           | Socket.io runtime. Authoritative state, timers and scoring; batches broadcasts so a 100+ player room stays cheap. |
| `apps/client`           | SvelteKit host dashboard and player UI.                            |

Games live in `packages/games/*`, depend only on `@arcade/core`, and register
their own socket events which the server and client intersect with the platform
contract.
