<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { ClientEvent, ServerEvent } from '@arcade/core';
  import type { RoomSnapshot } from '@arcade/core';
  import type { HostView, Variant } from '@arcade/rpsls';
  import { GESTURE_EMOJI, GESTURE_LABEL } from '@arcade/rpsls';
  import { connect } from '$lib/socket';
  import type { ArcadeSocket } from '$lib/socket';
  import Timer from '$lib/components/Timer.svelte';
  import Leaderboard from '$lib/components/Leaderboard.svelte';
  import RulesPanel from '$lib/components/RulesPanel.svelte';
  import TallyBars from '$lib/components/TallyBars.svelte';

  let socket: ArcadeSocket | null = null;

  let stage = $state<'setup' | 'lobby' | 'live'>('setup');
  let room = $state<RoomSnapshot | null>(null);
  let view = $state<HostView | null>(null);
  let error = $state('');
  let busy = $state(false);
  let closedReason = $state('');

  let rounds = $state(5);
  let variant = $state<Variant>('lizard-spock');
  let choiceSeconds = $state(15);
  let revealSeconds = $state(6);

  const joinUrl = $derived(
    browser && room ? `${window.location.origin}/play?code=${room.code}` : '',
  );
  const podium = $derived(view ? view.leaderboard.slice(0, 3) : []);

  onMount(() => {
    socket = connect();

    socket.on(ServerEvent.Room, (snapshot) => {
      room = snapshot;
      if (stage === 'setup') stage = 'lobby';
    });

    socket.on(ServerEvent.HostView, (payload) => {
      view = payload as HostView;
      stage = 'live';
    });

    socket.on(ServerEvent.Closed, ({ reason }) => {
      closedReason = reason;
      stage = 'setup';
      room = null;
      view = null;
    });
  });

  onDestroy(() => socket?.close());

  function createRoom() {
    if (!socket) return;
    busy = true;
    error = '';
    closedReason = '';
    socket.emit(
      ClientEvent.HostCreate,
      { gameId: 'rpsls', config: { rounds, variant, choiceSeconds, revealSeconds } },
      (result) => {
        busy = false;
        if (!result.ok) {
          error = result.error;
          return;
        }
        room = result.room;
        stage = 'lobby';
      },
    );
  }

  function startGame() {
    if (!socket) return;
    busy = true;
    error = '';
    socket.emit(ClientEvent.HostStart, (result) => {
      busy = false;
      if (!result.ok) error = result.error;
    });
  }

  function endGame() {
    socket?.emit(ClientEvent.HostEnd, () => {});
  }
</script>

<svelte:head><title>Host - All Hands Arcade</title></svelte:head>

<main class="page">
  {#if stage === 'setup'}
    <header>
      <span class="tag">Host</span>
      <h1>Rock Paper Scissors Lizard Spock</h1>
      <p class="muted">
        Every round the whole room throws at once and you score one point for each person you beat -
        so a 200-person tie is impossible.
      </p>
    </header>

    {#if closedReason}<p class="muted">{closedReason}</p>{/if}

    <section class="panel setup">
      <div class="grid">
        <label class="field">
          <span>Rounds</span>
          <input type="number" min="1" max="25" bind:value={rounds} />
        </label>
        <label class="field">
          <span>Seconds to choose</span>
          <input type="number" min="5" max="60" bind:value={choiceSeconds} />
        </label>
        <label class="field">
          <span>Seconds on the results</span>
          <input type="number" min="3" max="20" bind:value={revealSeconds} />
        </label>
      </div>

      <fieldset class="variants">
        <legend>Variant</legend>
        <label class:selected={variant === 'lizard-spock'}>
          <input type="radio" bind:group={variant} value="lizard-spock" />
          <strong>Lizard &amp; Spock</strong>
          <span class="muted">Five gestures, ten rules, one Big Bang Theory reference.</span>
        </label>
        <label class:selected={variant === 'classic'}>
          <input type="radio" bind:group={variant} value="classic" />
          <strong>Classic</strong>
          <span class="muted">Just Rock, Paper and Scissors.</span>
        </label>
      </fieldset>

      <p class="error">{error}</p>
      <button class="btn" onclick={createRoom} disabled={busy}>Create the room</button>
    </section>
  {:else if stage === 'lobby' && room}
    <div class="lobby">
      <section class="panel code-panel">
        <p class="muted">Go to <strong>{joinUrl || 'this site'}</strong> and enter</p>
        <p class="code">{room.code}</p>
        <p class="muted">{room.playerCount} {room.playerCount === 1 ? 'player' : 'players'} in</p>
        <p class="error">{error}</p>
        <div class="row">
          <button class="btn" onclick={startGame} disabled={busy || room.playerCount < 2}>
            Start {rounds} {rounds === 1 ? 'round' : 'rounds'}
          </button>
          <button class="btn ghost" onclick={endGame}>Close room</button>
        </div>
        {#if room.playerCount < 2}
          <p class="muted small">Waiting for at least two players.</p>
        {/if}
      </section>

      <section class="panel roster">
        <h3>In the room</h3>
        <ul>
          {#each room.players as player (player.id)}
            <li class:offline={!player.connected}>{player.name}</li>
          {/each}
        </ul>
      </section>
    </div>
  {:else if view}
    <div class="live">
      <header class="live-head">
        <div>
          <span class="tag">Room {room?.code}</span>
          <h2>
            {#if view.phase === 'final'}
              Final scores
            {:else if view.round > 0}
              Round {view.round} of {view.rounds}
            {:else}
              Get ready
            {/if}
          </h2>
        </div>
        <button class="btn ghost" onclick={endGame}>End game</button>
      </header>

      {#if view.phase === 'intro'}
        <section class="panel stage-panel">
          <h2>Throw at the same time. Score a point for everyone you beat.</h2>
          <p class="muted">
            {view.choiceSeconds} seconds a round, {view.rounds}
            {view.rounds === 1 ? 'round' : 'rounds'}, {view.playerCount} players.
          </p>
          <RulesPanel rules={view.rules} />
        </section>
      {:else if view.phase === 'choosing'}
        <section class="panel stage-panel choosing">
          <Timer endsAt={view.phaseEndsAt} total={view.choiceSeconds} size={200} />
          <div>
            <h2>{view.submitted} of {view.playerCount} locked in</h2>
            <p class="muted">Phones out. Everyone throws when the clock hits zero.</p>
            <div class="gestures">
              {#each view.gestures as gesture (gesture)}
                <span class="chip">{GESTURE_EMOJI[gesture]} {GESTURE_LABEL[gesture]}</span>
              {/each}
            </div>
          </div>
        </section>
      {:else if view.phase === 'reveal' && view.lastRound}
        <div class="columns">
          <section class="panel">
            <TallyBars tally={view.lastRound.tally} />
            <p class="muted small">
              {view.lastRound.submitted} threw, {view.lastRound.missed} missed the window.
            </p>
          </section>
          <section class="panel">
            <h3>Round {view.lastRound.round} winners</h3>
            <ol class="round-rows">
              {#each view.lastRound.results as result (result.playerId)}
                <li>
                  <span class="emoji">{GESTURE_EMOJI[result.gesture]}</span>
                  <span class="name">{result.name}</span>
                  <span class="points">+{result.beat}</span>
                </li>
              {/each}
            </ol>
          </section>
        </div>
        <section class="panel">
          <Leaderboard entries={view.leaderboard} />
        </section>
      {:else if view.phase === 'final'}
        <section class="panel podium-panel">
          <div class="podium">
            {#each podium as entry, index (entry.playerId)}
              <div class="spot spot-{index + 1}">
                <span class="medal">{index === 0 ? '1st' : index === 1 ? '2nd' : '3rd'}</span>
                <strong>{entry.name}</strong>
                <span class="points">{entry.score}</span>
              </div>
            {/each}
          </div>
          <Leaderboard entries={view.leaderboard} title="Final standings" />
        </section>
      {/if}
    </div>
  {/if}
</main>

<style>
  header {
    max-width: 760px;
    margin-bottom: 24px;
  }

  h1 {
    font-size: clamp(1.8rem, 5vw, 3rem);
    margin: 14px 0 10px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
  }

  .variants {
    border: 0;
    padding: 0;
    margin: 24px 0 8px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }

  .variants legend {
    font-size: 0.85rem;
    color: var(--muted);
    font-weight: 600;
    padding: 0 0 8px;
  }

  .variants label {
    display: grid;
    gap: 4px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 14px 16px;
    cursor: pointer;
  }

  .variants label.selected {
    border-color: var(--accent);
  }

  .variants input {
    display: none;
  }

  .variants span {
    font-size: 0.85rem;
  }

  .lobby {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }

  .code-panel {
    text-align: center;
  }

  .code {
    font-size: clamp(4rem, 18vw, 9rem);
    font-weight: 800;
    letter-spacing: 0.12em;
    margin: 8px 0;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .row {
    display: flex;
    gap: 12px;
    justify-content: center;
    flex-wrap: wrap;
  }

  .roster h3 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 12px;
  }

  .roster ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-height: 60vh;
    overflow-y: auto;
  }

  .roster li {
    background: var(--panel-2);
    border-radius: 999px;
    padding: 8px 14px;
    font-weight: 600;
    font-size: 0.9rem;
  }

  .roster li.offline {
    opacity: 0.45;
  }

  .live {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .live-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .live-head h2 {
    font-size: clamp(1.4rem, 4vw, 2.2rem);
    margin-top: 8px;
  }

  .stage-panel h2 {
    font-size: clamp(1.3rem, 3.4vw, 2rem);
    margin-bottom: 8px;
  }

  .choosing {
    display: flex;
    align-items: center;
    gap: clamp(20px, 5vw, 48px);
    flex-wrap: wrap;
  }

  .gestures {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .chip {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 8px 14px;
    font-weight: 600;
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 18px;
  }

  .columns h3 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 12px;
  }

  .round-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .round-rows li {
    display: grid;
    grid-template-columns: 2rem 1fr auto;
    align-items: center;
    gap: 12px;
    background: var(--panel-2);
    border-radius: 10px;
    padding: 10px 14px;
  }

  .points {
    font-weight: 800;
    color: var(--accent-2);
    font-variant-numeric: tabular-nums;
  }

  .podium {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 14px;
    margin-bottom: 24px;
  }

  .spot {
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 22px 16px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 14px;
    text-align: center;
  }

  .spot-1 {
    border-color: var(--accent-2);
  }

  .spot strong {
    font-size: 1.2rem;
  }

  .spot .points {
    font-size: 2rem;
  }

  .medal {
    color: var(--muted);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.8rem;
  }

  .small {
    font-size: 0.85rem;
  }

  @media (max-width: 860px) {
    .lobby {
      grid-template-columns: 1fr;
    }
  }
</style>
