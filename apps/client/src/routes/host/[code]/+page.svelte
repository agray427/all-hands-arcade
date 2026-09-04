<script lang="ts">
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';

  import JoinCode from '$lib/components/JoinCode.svelte';
  import Leaderboard from '$lib/components/Leaderboard.svelte';
  import PlayerWall from '$lib/components/PlayerWall.svelte';
  import Timer from '$lib/components/Timer.svelte';
  import WordPicker from '$lib/components/WordPicker.svelte';
  import { GameStore } from '$lib/state/game.svelte.js';

  const code = (page.params['code'] ?? '').toUpperCase();

  const store = new GameStore();
  let phase = $state<'checking' | 'denied' | 'ready'>('checking');
  let busy = $state(false);

  onMount(async () => {
    store.connect();
    await new Promise<void>((resolve) => {
      if (store.socket.connected) resolve();
      else store.socket.once('connect', () => resolve());
    });
    // The facilitator seat is held by the localStorage token minted at
    // room:create, so a refresh keeps control rather than opening it up.
    phase = (await store.tryResume(code)) ? 'ready' : 'denied';
  });

  onDestroy(() => store.destroy());

  const roundLabel = $derived(
    store.status === 'match_complete'
      ? 'Match complete'
      : store.inRound
        ? `Round ${store.roundIndex + 1} of ${store.roundCount}`
        : `Round ${Math.min(store.roundIndex + 2, store.roundCount)} of ${store.roundCount}`,
  );

  const solvedCount = $derived(store.progress.filter((b) => b.solved).length);
  const finishedCount = $derived(store.progress.filter((b) => b.finished).length);

  async function start(): Promise<void> {
    busy = true;
    await store.startRound();
    busy = false;
  }

  async function end(): Promise<void> {
    busy = true;
    await store.endRound();
    busy = false;
  }
</script>

<main class="page host">
  {#if phase === 'checking'}
    <p class="muted centered">Connecting…</p>
  {:else if phase === 'denied'}
    <div class="panel centered">
      <h1>This isn't your room</h1>
      <p class="muted">
        Facilitator control lives in the browser that created the room. If this was yours, it may
        have expired.
      </p>
      <a class="primary" href="/host">Create a new room</a>
    </div>
  {:else}
    <header class="topbar">
      <JoinCode code={store.code} big={!store.inRound} />

      <div class="state">
        <span class="eyebrow">{roundLabel}</span>
        {#if store.inRound}
          <Timer msRemaining={store.msRemaining} />
          <p class="muted tally">
            {finishedCount}/{store.progress.length} done · {solvedCount} solved
          </p>
        {:else}
          <p class="muted tally">
            {store.connectedPlayerCount}
            {store.connectedPlayerCount === 1 ? 'player' : 'players'} connected
          </p>
        {/if}
      </div>

      <div class="controls">
        {#if store.inRound}
          <button class="danger" onclick={end} disabled={busy}>End round now</button>
        {:else if store.status !== 'match_complete'}
          <button class="primary" onclick={start} disabled={busy || !store.hasSecret}>
            {store.roundIndex < 0 ? 'Start round 1' : `Start round ${store.roundIndex + 2}`}
          </button>
          {#if !store.hasSecret}
            <p class="muted hint">Choose a word to enable this</p>
          {/if}
        {/if}
      </div>
    </header>

    {#if store.fatal !== null}
      <p class="banner danger" role="alert">{store.fatal}</p>
    {/if}

    {#if store.reveal !== null && !store.inRound}
      <section class="panel reveal-panel">
        <div>
          <span class="eyebrow">Round {store.reveal.index + 1} answer</span>
          <strong class="reveal">{store.reveal.secret.toUpperCase()}</strong>
        </div>
        <p class="muted">
          {store.reveal.solvedCount} of {store.progress.length}
          {store.reveal.solvedCount === 1 ? 'player' : 'players'} solved it.
        </p>
      </section>
    {/if}

    <div class="columns">
      <div class="left">
        {#if !store.inRound && store.status !== 'match_complete'}
          <section class="panel">
            <h2>Secret word</h2>
            <WordPicker
              current={store.secret}
              error={store.error}
              shakeToken={store.shakeToken}
              {busy}
              onSubmit={(word) => store.setSecret(word)}
              onRandom={() => void store.randomSecret()}
              onDismissError={() => store.dismissError()}
            />
          </section>
        {/if}

        <section class="panel">
          <h2>The room</h2>
          <PlayerWall boards={store.progress} participants={store.participants} />
        </section>
      </div>

      <aside class="panel right">
        <h2>Leaderboard</h2>
        <Leaderboard entries={store.leaderboard} roundCount={store.roundCount} />
      </aside>
    </div>
  {/if}
</main>

<style>
  .host {
    max-width: 1280px;
    display: grid;
    gap: var(--space-4);
    align-content: start;
  }

  .centered {
    text-align: center;
    display: grid;
    gap: var(--space-3);
    justify-items: center;
    padding: var(--space-7) var(--space-4);
  }

  .topbar {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: var(--space-5);
    align-items: center;
    padding: var(--space-5);
    background: var(--surface-glass);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-3);
  }

  .state {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
  }

  .tally {
    margin: 0;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .controls {
    display: grid;
    gap: var(--space-2);
    justify-items: stretch;
  }

  .hint {
    margin: 0;
    font-size: 0.78rem;
    text-align: center;
  }

  button,
  .primary {
    padding: var(--space-3) var(--space-5);
    border: none;
    border-radius: var(--radius-2);
    font-weight: 800;
    text-decoration: none;
    text-align: center;
    white-space: nowrap;
  }

  .primary {
    background: var(--accent);
    color: var(--accent-ink);
  }

  button.danger {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger);
  }

  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .banner.danger {
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-2);
    background: rgba(240, 97, 109, 0.14);
    color: var(--danger);
    font-weight: 600;
  }

  .reveal-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .reveal {
    display: block;
    font-family: var(--font-mono);
    font-size: clamp(1.8rem, 6vw, 2.8rem);
    letter-spacing: 0.2em;
    color: var(--accent);
  }

  .reveal-panel p {
    margin: 0;
  }

  .columns {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: minmax(0, 2fr) minmax(18rem, 1fr);
    align-items: start;
  }

  .left {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  h2 {
    font-size: 1rem;
    margin-bottom: var(--space-3);
  }

  @media (max-width: 900px) {
    .topbar,
    .columns {
      grid-template-columns: 1fr;
    }

    .state {
      justify-items: start;
    }
  }
</style>
