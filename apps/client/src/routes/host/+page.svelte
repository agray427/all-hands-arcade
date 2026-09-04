<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { DEFAULT_ROUND_COUNT, ROUND_DURATION_MS } from '@arcade/cipher';
  import { MAX_ROUND_COUNT, MIN_ROUND_COUNT } from '@arcade/core';

  import { GameStore } from '$lib/state/game.svelte.js';
  import { loadName, saveName } from '$lib/state/session.svelte.js';

  const store = new GameStore();
  store.connect();
  onDestroy(() => store.destroy());

  let displayName = $state(loadName() || 'Facilitator');
  let roundCount = $state(DEFAULT_ROUND_COUNT);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const minutes = $derived((ROUND_DURATION_MS / 60_000) * roundCount);

  async function create(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    busy = true;
    error = null;
    try {
      saveName(displayName);
      const code = await store.host(displayName, roundCount);
      await goto(`/host/${code}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not create the room';
      busy = false;
    }
  }
</script>

<main class="page setup">
  <a class="back" href="/">← Back</a>
  <h1>Host a game of Cipher</h1>

  <form class="panel" onsubmit={create}>
    <label>
      <span class="eyebrow">Your name</span>
      <input bind:value={displayName} maxlength="24" required />
    </label>

    <fieldset>
      <legend class="eyebrow">Rounds</legend>
      <div class="rounds">
        {#each Array.from({ length: MAX_ROUND_COUNT - MIN_ROUND_COUNT + 1 }, (_, i) => i + MIN_ROUND_COUNT) as n (n)}
          <button
            type="button"
            class="round"
            class:selected={roundCount === n}
            onclick={() => (roundCount = n)}
            aria-pressed={roundCount === n}
          >
            {n}
          </button>
        {/each}
      </div>
      <p class="muted hint">
        Each round is a fixed three minutes, so this is about
        <strong>{minutes} minutes</strong> of play. Round length is not adjustable — the points
        curve is built around it.
      </p>
    </fieldset>

    {#if error !== null}
      <p class="error" role="alert">{error}</p>
    {/if}

    <button class="primary" type="submit" disabled={busy || store.connection !== 'online'}>
      {store.connection === 'online' ? (busy ? 'Creating…' : 'Create room') : 'Connecting…'}
    </button>
  </form>
</main>

<style>
  .setup {
    max-width: 34rem;
    display: grid;
    gap: var(--space-4);
  }

  .back {
    color: var(--text-3);
    text-decoration: none;
    font-size: 0.9rem;
  }

  .back:hover {
    color: var(--text-1);
  }

  h1 {
    font-size: clamp(1.8rem, 6vw, 2.6rem);
  }

  form {
    display: grid;
    gap: var(--space-5);
  }

  label {
    display: grid;
    gap: var(--space-2);
  }

  input {
    padding: var(--space-3);
    background: var(--surface-2);
    border: 2px solid var(--border-2);
    border-radius: var(--radius-2);
  }

  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-2);
  }

  .rounds {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .round {
    width: 2.9rem;
    height: 2.9rem;
    border-radius: var(--radius-2);
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    font-weight: 700;
  }

  .round.selected {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
  }

  .error {
    margin: 0;
    color: var(--danger);
    font-weight: 600;
  }

  .primary {
    padding: var(--space-4);
    border: none;
    border-radius: var(--radius-2);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
    font-size: 1.05rem;
  }

  .primary:disabled {
    opacity: 0.5;
  }
</style>
