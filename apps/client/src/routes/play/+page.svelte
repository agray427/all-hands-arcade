<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { ClientEvent, ServerEvent } from '@arcade/core';
  import type { RoomSnapshot } from '@arcade/core';
  import type { Gesture, PlayerView } from '@arcade/rpsls';
  import { GESTURE_EMOJI, GESTURE_LABEL } from '@arcade/rpsls';
  import { connect } from '$lib/socket';
  import type { ArcadeSocket } from '$lib/socket';
  import Timer from '$lib/components/Timer.svelte';
  import Leaderboard from '$lib/components/Leaderboard.svelte';
  import RulesPanel from '$lib/components/RulesPanel.svelte';

  let socket: ArcadeSocket | null = null;

  let stage = $state<'join' | 'waiting' | 'playing' | 'closed'>('join');
  let code = $state('');
  let name = $state('');
  let error = $state('');
  let busy = $state(false);
  let closedReason = $state('');

  let playerId = $state<string | null>(null);
  let room = $state<RoomSnapshot | null>(null);
  let view = $state<PlayerView | null>(null);

  /** Set the moment a gesture is tapped so the button reacts before the server answers. */
  let optimisticPick = $state<Gesture | null>(null);

  const pick = $derived(view?.pick ?? optimisticPick);
  const choiceSeconds = $derived(
    view && view.phaseEndsAt > 0 ? Math.max(1, Math.round((view.phaseEndsAt - Date.now()) / 1000)) : 15,
  );

  const storageKey = (roomCode: string) => `arcade:player:${roomCode.toUpperCase()}`;

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    code = (params.get('code') ?? '').toUpperCase();

    socket = connect();

    socket.on('connect', () => {
      // A dropped socket comes back with the same seat, and the same score.
      if (stage !== 'join' && playerId) join();
    });

    socket.on(ServerEvent.Room, (snapshot) => {
      room = snapshot;
    });

    socket.on(ServerEvent.PlayerView, (payload) => {
      const next = payload as PlayerView;
      // Drop the optimistic pick once the round it belonged to is over.
      if (next.round !== view?.round || next.phase !== 'choosing') optimisticPick = null;
      view = next;
      stage = 'playing';
    });

    socket.on(ServerEvent.Closed, ({ reason }) => {
      closedReason = reason;
      stage = 'closed';
      view = null;
    });
  });

  onDestroy(() => socket?.close());

  function join() {
    if (!socket) return;
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) {
      error = 'Enter the room code from the screen.';
      return;
    }

    const remembered = browser ? window.sessionStorage.getItem(storageKey(roomCode)) : null;
    busy = true;
    error = '';

    socket.emit(
      ClientEvent.PlayerJoin,
      { roomCode, name: name.trim(), playerId: playerId ?? remembered ?? undefined },
      (result) => {
        busy = false;
        if (!result.ok) {
          error = result.error;
          if (stage !== 'join') stage = 'join';
          return;
        }
        playerId = result.playerId;
        name = result.name;
        room = result.room;
        code = roomCode;
        if (browser) window.sessionStorage.setItem(storageKey(roomCode), result.playerId);
        if (stage === 'join') stage = 'waiting';
      },
    );
  }

  function choose(gesture: Gesture) {
    if (!socket || view?.phase !== 'choosing') return;
    optimisticPick = gesture;
    socket.emit(ClientEvent.PlayerAction, { action: { type: 'pick', gesture } });
  }
</script>

<svelte:head><title>Play - All Hands Arcade</title></svelte:head>

<main class="page narrow">
  {#if stage === 'join' || stage === 'closed'}
    <header>
      <span class="tag">Player</span>
      <h1>Join the game</h1>
      {#if closedReason}<p class="muted">{closedReason}</p>{/if}
    </header>

    <section class="panel">
      <label class="field">
        <span>Room code</span>
        <input
          type="text"
          bind:value={code}
          maxlength="8"
          autocapitalize="characters"
          autocomplete="off"
          placeholder="ABCD"
          class="code-input"
        />
      </label>
      <label class="field spaced">
        <span>Your name</span>
        <input type="text" bind:value={name} maxlength="20" placeholder="Sheldon" />
      </label>
      <p class="error">{error}</p>
      <button class="btn wide" onclick={join} disabled={busy}>Join</button>
    </section>
  {:else if stage === 'waiting'}
    <section class="panel centred">
      <h1>You are in.</h1>
      <p class="muted">
        Playing as <strong>{name}</strong> in room {code}.
      </p>
      <p class="muted">
        {room?.playerCount ?? 1} here so far. Waiting for the host to start.
      </p>
    </section>
  {:else if view}
    <section class="status">
      <span class="tag">
        {view.phase === 'final' ? 'Game over' : `Round ${Math.max(1, view.round)} / ${view.rounds}`}
      </span>
      <span class="tag">{view.total} {view.total === 1 ? 'point' : 'points'}</span>
      {#if view.rank > 0}<span class="tag">#{view.rank} of {view.playerCount}</span>{/if}
    </section>

    {#if view.phase === 'intro'}
      <section class="panel centred">
        <h1>Get ready, {name}.</h1>
        <p class="muted">
          Each round you score one point for every player your gesture beats. Ties score nothing, so
          pick something the room will not.
        </p>
        <RulesPanel rules={view.rules} compact />
      </section>
    {:else if view.phase === 'choosing'}
      <section class="panel choose">
        <Timer endsAt={view.phaseEndsAt} total={choiceSeconds} size={110} />
        <h2>{pick ? 'Locked in - change it if you dare' : 'Throw something'}</h2>
        <div class="gestures" class:five={view.gestures.length > 3}>
          {#each view.gestures as gesture (gesture)}
            <button
              class="gesture"
              class:picked={pick === gesture}
              onclick={() => choose(gesture)}
              aria-pressed={pick === gesture}
            >
              <span class="emoji">{GESTURE_EMOJI[gesture]}</span>
              <span>{GESTURE_LABEL[gesture]}</span>
            </button>
          {/each}
        </div>
      </section>
    {:else if view.phase === 'reveal' || view.phase === 'final'}
      {#if view.result}
        <section class="panel result">
          <span class="emoji big">{GESTURE_EMOJI[view.result.gesture]}</span>
          <h1 class="scored">+{view.result.beat}</h1>
          <p>
            You threw {GESTURE_LABEL[view.result.gesture]} and beat
            <strong>{view.result.beat}</strong>
            {view.result.beat === 1 ? 'player' : 'players'}.
          </p>
          <div class="breakdown">
            <div><strong>{view.result.beat}</strong><span>beaten</span></div>
            <div><strong>{view.result.lost}</strong><span>beat you</span></div>
            <div><strong>{view.result.tied}</strong><span>same throw</span></div>
          </div>
        </section>
      {:else}
        <section class="panel result">
          <h1 class="missed">No throw</h1>
          <p class="muted">You ran out of time, so that round scored nothing. Get in early.</p>
        </section>
      {/if}

      {#if view.phase === 'final'}
        <section class="panel centred">
          <h2>You finished #{view.rank} of {view.playerCount} with {view.total} points.</h2>
        </section>
      {/if}

      <section class="panel">
        <Leaderboard entries={view.leaderboard} highlight={playerId} title="Top of the room" />
      </section>
    {/if}
  {/if}
</main>

<style>
  .narrow {
    max-width: 560px;
  }

  header {
    margin-bottom: 20px;
  }

  h1 {
    font-size: clamp(1.6rem, 6vw, 2.4rem);
    margin: 12px 0;
  }

  .spaced {
    margin-top: 16px;
  }

  .code-input {
    text-transform: uppercase;
    letter-spacing: 0.3em;
    font-size: 1.6rem;
    font-weight: 700;
    text-align: center;
  }

  .wide {
    width: 100%;
  }

  .centred {
    text-align: center;
  }

  .status {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  .choose {
    display: grid;
    justify-items: center;
    gap: 14px;
  }

  .choose h2 {
    font-size: 1.05rem;
    color: var(--muted);
    text-align: center;
  }

  .gestures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
  }

  .gestures.five {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  /* Five gestures leave a lone button on the last row - let it span instead. */
  .gestures.five .gesture:last-child {
    grid-column: span 2;
  }

  .gesture {
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 20px 10px;
    background: var(--panel-2);
    border: 2px solid var(--line);
    border-radius: 16px;
    font-weight: 700;
    min-height: 108px;
    transition: border-color 0.12s ease, transform 0.08s ease;
  }

  .gesture:active {
    transform: scale(0.97);
  }

  .gesture.picked {
    border-color: var(--accent-2);
    background: color-mix(in srgb, var(--accent-2) 14%, var(--panel-2));
  }

  .emoji {
    font-size: 2rem;
    line-height: 1;
  }

  .emoji.big {
    font-size: 3.4rem;
  }

  .result {
    display: grid;
    justify-items: center;
    gap: 10px;
    text-align: center;
  }

  .scored {
    font-size: clamp(3rem, 16vw, 5rem);
    margin: 0;
    color: var(--accent-2);
  }

  .missed {
    color: var(--lose);
  }

  .breakdown {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    width: 100%;
    margin-top: 6px;
  }

  .breakdown div {
    display: grid;
    gap: 2px;
    padding: 12px 8px;
    background: var(--panel-2);
    border-radius: 12px;
  }

  .breakdown strong {
    font-size: 1.5rem;
  }

  .breakdown span {
    font-size: 0.78rem;
    color: var(--muted);
  }
</style>
