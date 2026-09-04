<script lang="ts">
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  import { MAX_GUESSES } from '@arcade/cipher';

  import Grid from '$lib/components/Grid.svelte';
  import Keyboard from '$lib/components/Keyboard.svelte';
  import Leaderboard from '$lib/components/Leaderboard.svelte';
  import Timer from '$lib/components/Timer.svelte';
  import { GameStore } from '$lib/state/game.svelte.js';
  import { loadName, saveName } from '$lib/state/session.svelte.js';

  const code = (page.params['code'] ?? '').toUpperCase();

  const store = new GameStore();
  let phase = $state<'checking' | 'name' | 'playing'>('checking');
  let displayName = $state(loadName());
  let joinError = $state<string | null>(null);
  let joining = $state(false);

  onMount(async () => {
    store.connect();
    // Wait for the socket before deciding whether we already have a seat here.
    await new Promise<void>((resolve) => {
      if (store.socket.connected) resolve();
      else store.socket.once('connect', () => resolve());
    });
    phase = (await store.tryResume(code)) ? 'playing' : 'name';
  });

  onDestroy(() => store.destroy());

  async function join(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (joining) return;
    joining = true;
    joinError = null;
    try {
      saveName(displayName);
      await store.join(code, displayName);
      phase = 'playing';
    } catch (err) {
      joinError = err instanceof Error ? err.message : 'Could not join';
    } finally {
      joining = false;
    }
  }

  // Physical keyboard mirrors the on-screen one.
  function onKeydown(event: KeyboardEvent): void {
    if (phase !== 'playing' || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      void store.submit();
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      store.backspace();
    } else if (/^[a-zA-Z]$/.test(event.key)) {
      store.press(event.key);
    }
  }

  const me = $derived(store.identity?.playerId ?? null);
  const myScore = $derived(store.leaderboard.find((e) => e.playerId === me) ?? null);
</script>

<svelte:window onkeydown={onKeydown} />

<main class="page play">
  {#if phase === 'checking'}
    <p class="muted centered">Connecting…</p>
  {:else if phase === 'name'}
    <div class="join-card panel">
      <p class="eyebrow">Room {code}</p>
      <h1>What should we call you?</h1>
      <form onsubmit={join}>
        <input
          bind:value={displayName}
          placeholder="Your name"
          maxlength="24"
          required
          autocomplete="name"
        />
        <button class="primary" type="submit" disabled={joining}>
          {joining ? 'Joining…' : 'Join game'}
        </button>
      </form>
      {#if joinError !== null}
        <p class="error" role="alert">{joinError}</p>
      {/if}
    </div>
  {:else}
    <header class="bar">
      <div class="who">
        <span class="eyebrow">Room {store.code}</span>
        <strong>{store.snapshot?.participants.find((p) => p.id === me)?.displayName ?? 'You'}</strong>
      </div>

      <div class="centre">
        {#if store.inRound}
          <Timer msRemaining={store.msRemaining} />
        {:else if store.roundCount > 0}
          <span class="round-pill">
            {store.status === 'match_complete'
              ? 'Final'
              : `Round ${Math.max(1, store.roundIndex + 1)} of ${store.roundCount}`}
          </span>
        {/if}
      </div>

      <div class="score">
        <span class="eyebrow">Total</span>
        <strong>{(myScore?.totalPoints ?? 0).toLocaleString()}</strong>
      </div>
    </header>

    {#if store.connection === 'offline'}
      <p class="banner warn" role="status">Reconnecting…</p>
    {/if}
    {#if store.fatal !== null}
      <p class="banner danger" role="alert">{store.fatal}</p>
    {/if}

    {#if store.inRound}
      <section class="board">
        <Grid
          rows={store.rows}
          shakeToken={store.shakeToken}
          revealToken={store.revealToken}
          solved={store.solved}
        />

        <div class="status" aria-live="polite">
          {#if store.error !== null}
            <p class="error" role="alert">{store.error}</p>
          {:else if store.solved}
            <p class="good">
              Solved in {store.guesses.length}
              {store.guesses.length === 1 ? 'guess' : 'guesses'} — {store.roundPoints ?? 0} points
            </p>
          {:else if store.outOfGuesses}
            <p class="muted">Out of guesses. Hang tight for the reveal.</p>
          {:else}
            <p class="muted">{MAX_GUESSES - store.guesses.length} guesses left</p>
          {/if}
        </div>

        <Keyboard
          states={store.keyboard}
          disabled={!store.canType}
          onKey={(l) => store.press(l)}
          onEnter={() => void store.submit()}
          onBackspace={() => store.backspace()}
        />
      </section>
    {:else}
      <section class="waiting panel">
        {#if store.reveal !== null}
          <p class="eyebrow">Round {store.reveal.index + 1} answer</p>
          <strong class="reveal">{store.reveal.secret.toUpperCase()}</strong>
          <p class="muted">
            {store.reveal.solvedCount}
            {store.reveal.solvedCount === 1 ? 'player' : 'players'} got it.
          </p>
        {:else if store.status === 'match_complete'}
          <h1>That's the match</h1>
        {:else}
          <h1>Waiting for the facilitator</h1>
          <p class="muted">
            {store.hasSecret ? 'The word is set. Starting shortly…' : 'They are choosing a word.'}
          </p>
        {/if}
      </section>
    {/if}

    <section class="panel">
      <h2>Leaderboard</h2>
      <Leaderboard
        entries={store.leaderboard}
        highlight={me}
        roundCount={store.roundCount}
        compact
        limit={10}
      />
    </section>
  {/if}
</main>

<style>
  .play {
    display: grid;
    gap: var(--space-4);
    align-content: start;
    min-height: 100dvh;
    max-width: 40rem;
  }

  .centered {
    text-align: center;
    padding: var(--space-7) 0;
  }

  .join-card {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-6);
  }

  .join-card h1 {
    font-size: 1.5rem;
  }

  .join-card form {
    display: grid;
    gap: var(--space-3);
  }

  input {
    padding: var(--space-3);
    background: var(--surface-2);
    border: 2px solid var(--border-2);
    border-radius: var(--radius-2);
  }

  .primary {
    padding: var(--space-4);
    border: none;
    border-radius: var(--radius-2);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
  }

  .bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-3);
  }

  .who,
  .score {
    display: grid;
    gap: 2px;
  }

  .score {
    justify-items: end;
    text-align: right;
  }

  .score strong {
    font-family: var(--font-mono);
    font-size: 1.2rem;
  }

  .centre {
    display: grid;
    place-items: center;
  }

  .round-pill {
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    border: 1px solid var(--border-1);
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .banner {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-2);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .banner.warn {
    background: rgba(232, 180, 74, 0.14);
    color: var(--warn);
  }

  .banner.danger {
    background: rgba(240, 97, 109, 0.14);
    color: var(--danger);
  }

  .board {
    display: grid;
    gap: var(--space-4);
  }

  .status {
    min-height: 1.6rem;
    text-align: center;
  }

  .status p {
    margin: 0;
    font-weight: 600;
    font-size: 0.95rem;
  }

  .error {
    color: var(--danger);
  }

  .good {
    color: var(--accent);
  }

  .waiting {
    display: grid;
    gap: var(--space-2);
    justify-items: center;
    text-align: center;
    padding: var(--space-6) var(--space-4);
  }

  .waiting h1 {
    font-size: 1.4rem;
  }

  .waiting p {
    margin: 0;
  }

  .reveal {
    font-family: var(--font-mono);
    font-size: clamp(2rem, 12vw, 3.2rem);
    letter-spacing: 0.2em;
    color: var(--accent);
  }

  h2 {
    font-size: 1rem;
    margin-bottom: var(--space-3);
  }
</style>
