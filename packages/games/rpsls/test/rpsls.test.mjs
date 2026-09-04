import test from 'node:test';
import assert from 'node:assert/strict';
import { rpsls, beats, describe, ruleBook, LIZARD_SPOCK_GESTURES } from '../dist/index.js';

const players = (count, prefix = 'P') =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    name: `${prefix}${i}`,
    connected: true,
    joinedAt: 0,
  }));

const ctx = (roster, now = 0) => ({ now, players: roster });

/** Run a game to the point where round 1 is open for picks. */
function openRound(roster, overrides = {}) {
  const config = rpsls.parseConfig({ rounds: 2, choiceSeconds: 15, revealSeconds: 5, ...overrides });
  let state = rpsls.create(config, ctx(roster, 0));
  state = rpsls.tick(state, ctx(roster, 10_000));
  assert.equal(state.phase, 'choosing');
  return { state, config };
}

const pickAll = (state, roster, gestureOf) =>
  roster.reduce(
    (acc, player, index) =>
      rpsls.submit(acc, player.id, { type: 'pick', gesture: gestureOf(player, index) }, ctx(roster)),
    state,
  );

test('every gesture beats exactly two others and loses to two', () => {
  for (const attacker of LIZARD_SPOCK_GESTURES) {
    const wins = LIZARD_SPOCK_GESTURES.filter((other) => beats(attacker, other));
    const losses = LIZARD_SPOCK_GESTURES.filter((other) => beats(other, attacker));
    assert.equal(wins.length, 2, `${attacker} should beat two gestures`);
    assert.equal(losses.length, 2, `${attacker} should lose to two gestures`);
    assert.ok(!beats(attacker, attacker), 'a gesture never beats itself');
  }
});

test('the rule book is Sheldon canon', () => {
  assert.equal(ruleBook('lizard-spock').length, 10);
  assert.equal(ruleBook('classic').length, 3);
  assert.equal(describe('spock', 'rock'), 'Spock vaporizes Rock');
  assert.equal(describe('lizard', 'spock'), 'Lizard poisons Spock');
  assert.equal(describe('scissors', 'lizard'), 'Scissors decapitates Lizard');
  assert.equal(describe('rock', 'paper'), null, 'paper covers rock, not the other way round');
});

test('a point per opponent beaten, counted across the whole room', () => {
  // 40 rock, 30 scissors, 20 lizard, 10 spock.
  const roster = players(100);
  const gestureFor = (index) =>
    index < 40 ? 'rock' : index < 70 ? 'scissors' : index < 90 ? 'lizard' : 'spock';

  let { state } = openRound(roster);
  state = pickAll(state, roster, (_, index) => gestureFor(index));
  state = rpsls.tick(state, ctx(roster, 30_000));

  assert.equal(state.phase, 'reveal');
  const summary = state.lastRound;
  assert.equal(summary.submitted, 100);

  const scoreOf = (index) => summary.results.find((r) => r.playerId === `P${index}`);
  // Rock crushes scissors (30) and lizard (20); Spock vaporizes it.
  assert.equal(scoreOf(0).beat, 50);
  assert.equal(scoreOf(0).lost, 10);
  assert.equal(scoreOf(0).tied, 39);
  // Scissors cuts paper (0) and decapitates lizard (20).
  assert.equal(scoreOf(40).beat, 20);
  // Lizard poisons spock (10) and eats paper (0).
  assert.equal(scoreOf(70).beat, 10);
  // Spock smashes scissors (30) and vaporizes rock (40).
  assert.equal(scoreOf(90).beat, 70);

  const board = rpsls.leaderboard(state, ctx(roster));
  assert.equal(board[0].score, 70, 'the ten Spocks lead the room');
  assert.equal(board.filter((entry) => entry.rank === 1).length, 10);
});

test('a perfectly balanced standoff still scores everyone', () => {
  const roster = players(5);
  let { state } = openRound(roster);
  state = pickAll(state, roster, (_, index) => LIZARD_SPOCK_GESTURES[index]);
  state = rpsls.tick(state, ctx(roster, 30_000));

  assert.equal(state.phase, 'reveal', 'the round resolves rather than deadlocking');
  assert.ok(
    state.lastRound.results.every((result) => result.beat === 2 && result.lost === 2),
    'each gesture beats two of the other four and loses to two',
  );
});

test('the whole room throwing the same thing scores nobody, and the game moves on', () => {
  const roster = players(50);
  let { state } = openRound(roster);
  state = pickAll(state, roster, () => 'rock');
  state = rpsls.tick(state, ctx(roster, 30_000));

  assert.equal(state.phase, 'reveal');
  assert.ok(state.lastRound.results.every((result) => result.beat === 0 && result.tied === 49));
  assert.equal(rpsls.leaderboard(state, ctx(roster))[0].score, 0);
});

test('players who miss the window score nothing and are not free points', () => {
  const roster = players(3);
  let { state } = openRound(roster);
  state = rpsls.submit(state, 'P0', { type: 'pick', gesture: 'rock' }, ctx(roster));
  state = rpsls.submit(state, 'P1', { type: 'pick', gesture: 'spock' }, ctx(roster));

  // P2 never picks, so the clock has to run out. Round 1 opened at 10s, so it closes at 25s.
  state = rpsls.tick(state, ctx(roster, 24_000));
  assert.equal(state.phase, 'choosing', 'the round waits for the timer when someone is missing');
  state = rpsls.tick(state, ctx(roster, 25_500));

  assert.equal(state.phase, 'reveal');
  assert.equal(state.lastRound.submitted, 2);
  assert.equal(state.lastRound.missed, 1);
  assert.equal(state.lastRound.results.find((r) => r.playerId === 'P1').beat, 1, 'spock beats one rock, not two');
  assert.equal(state.totals.P2, undefined);
  assert.equal(rpsls.playerView(state, 'P2', ctx(roster)).result, null);
});

test('a round closes early once everyone has thrown', () => {
  const roster = players(4);
  let { state } = openRound(roster);
  state = pickAll(state, roster, () => 'paper');
  state = rpsls.tick(state, ctx(roster, 1_000));
  assert.equal(state.phase, 'reveal', 'no waiting on a timer nobody needs');
});

test('phases run intro to final and stop there', () => {
  const roster = players(2);
  const config = rpsls.parseConfig({ rounds: 2, choiceSeconds: 15, revealSeconds: 5 });
  let state = rpsls.create(config, ctx(roster, 0));
  assert.equal(state.phase, 'intro');

  const seen = [];
  for (let now = 0; now <= 120_000; now += 500) {
    state = rpsls.tick(state, ctx(roster, now));
    const marker = `${state.phase}${state.round}`;
    if (seen.at(-1) !== marker) seen.push(marker);
  }

  assert.deepEqual(seen, ['intro0', 'choosing1', 'reveal1', 'choosing2', 'reveal2', 'final2']);
  assert.equal(rpsls.isOver(state), true);
});

test('picks can be changed until the timer stops, but not after', () => {
  const roster = players(2);
  let { state } = openRound(roster);

  state = rpsls.submit(state, 'P0', { type: 'pick', gesture: 'rock' }, ctx(roster));
  const afterFirst = state.version;
  state = rpsls.submit(state, 'P0', { type: 'pick', gesture: 'rock' }, ctx(roster));
  assert.equal(state.version, afterFirst, 're-picking the same gesture is a no-op');

  state = rpsls.submit(state, 'P0', { type: 'pick', gesture: 'spock' }, ctx(roster));
  assert.equal(state.picks.P0, 'spock');

  state = rpsls.submit(state, 'P1', { type: 'pick', gesture: 'paper' }, ctx(roster));
  state = rpsls.tick(state, ctx(roster, 30_000));
  const locked = rpsls.submit(state, 'P0', { type: 'pick', gesture: 'rock' }, ctx(roster));
  assert.equal(locked.version, state.version, 'the reveal ignores late picks');
});

test('untrusted input never reaches the scoreboard', () => {
  const roster = players(2);
  let { state } = openRound(roster);
  const before = state.version;

  for (const action of [null, {}, { type: 'pick' }, { type: 'pick', gesture: 'rocket' }, 'rock', 42]) {
    assert.equal(rpsls.submit(state, 'P0', action, ctx(roster)).version, before);
  }
  assert.equal(
    rpsls.submit(state, 'nobody', { type: 'pick', gesture: 'rock' }, ctx(roster)).version,
    before,
    'a player who is not in the room cannot play',
  );

  const classic = openRound(roster, { variant: 'classic' });
  assert.equal(
    rpsls.submit(classic.state, 'P0', { type: 'pick', gesture: 'spock' }, ctx(roster)).version,
    classic.state.version,
    'Spock is not on the board in the classic variant',
  );
});

test('host config is clamped rather than trusted', () => {
  assert.deepEqual(rpsls.parseConfig({}), {
    rounds: 5,
    variant: 'lizard-spock',
    choiceSeconds: 15,
    revealSeconds: 6,
  });
  assert.deepEqual(rpsls.parseConfig({ rounds: 9_999, choiceSeconds: -5, revealSeconds: 1_000 }), {
    rounds: 25,
    variant: 'lizard-spock',
    choiceSeconds: 5,
    revealSeconds: 20,
  });
  assert.equal(rpsls.parseConfig({ rounds: 'many' }).rounds, 5);
  assert.equal(rpsls.parseConfig({ variant: 'classic' }).variant, 'classic');
  assert.equal(rpsls.parseConfig({ variant: 'nonsense' }).variant, 'lizard-spock');
  assert.equal(rpsls.parseConfig(null).rounds, 5);
});

test('someone who joins late lands on the board on zero', () => {
  const roster = players(2);
  let { state } = openRound(roster);
  state = pickAll(state, roster, () => 'rock');
  state = rpsls.tick(state, ctx(roster, 30_000));

  const withLatecomer = [...roster, { id: 'late', name: 'Latecomer', connected: true, joinedAt: 1 }];
  const view = rpsls.playerView(state, 'late', ctx(withLatecomer));
  assert.equal(view.total, 0);
  assert.equal(view.playerCount, 3);
  assert.equal(rpsls.leaderboard(state, ctx(withLatecomer)).length, 3);
});

test('views only carry what each screen needs', () => {
  const roster = players(30);
  let { state } = openRound(roster);
  state = pickAll(state, roster, (_, index) => LIZARD_SPOCK_GESTURES[index % 5]);
  state = rpsls.tick(state, ctx(roster, 30_000));

  const host = rpsls.hostView(state, ctx(roster));
  assert.equal(host.leaderboard.length, 12);
  assert.equal(host.lastRound.results.length, 10);
  assert.equal(host.lastRound.submitted, 30, 'the counts still describe the whole room');

  const player = rpsls.playerView(state, 'P0', ctx(roster));
  assert.equal(player.leaderboard.length, 5);
  assert.equal(player.result.playerId, 'P0');
  assert.equal(player.pick, 'rock', 'the reveal still shows what you threw');
  assert.equal(player.rules.length, 10);

  const nextRound = rpsls.tick(state, ctx(roster, 40_000));
  assert.equal(nextRound.phase, 'choosing');
  assert.equal(rpsls.playerView(nextRound, 'P0', ctx(roster)).pick, null, 'a new round starts empty');
});
