<script lang="ts">
  import { onMount } from "svelte";
  import { ArcadeClient } from "$lib/arcade.svelte";
  import Countdown from "$lib/components/Countdown.svelte";
  import GamePicker from "$lib/components/GamePicker.svelte";
  import Leaderboard from "$lib/components/Leaderboard.svelte";

  const arcade = new ArcadeClient();
  let hostName = $state("");

  onMount(() => {
    void arcade.resume();
  });

  const view = $derived(arcade.game?.view ?? null);
  const alive = $derived(
    view ? view.contestants.filter((id) => view.eliminatedAt[id] === undefined) : [],
  );

  $effect(() => {
    if (arcade.room && !arcade.catalog) arcade.loadCatalog();
  });

  function create() {
    const name = hostName.trim();
    if (name) arcade.createRoom(name);
  }
</script>

<h1>Host</h1>

{#if arcade.lastError}
  <p class="error">{arcade.lastError}</p>
{/if}

{#if arcade.room && !arcade.connected}
  <p class="reconnecting">Connection lost — reconnecting…</p>
{/if}

{#if !arcade.room && arcade.notice}
  <p class="notice">{arcade.notice}</p>
{/if}

{#if !arcade.room}
  <form onsubmit={(e) => { e.preventDefault(); create(); }}>
    <input placeholder="Your name" bind:value={hostName} />
    <button type="submit" disabled={!hostName.trim()}>Create session</button>
  </form>
{:else}
  <section class="code" class:compact={!!view || !!arcade.results}>
    <span class="label">Room code</span>
    <span class="value">{arcade.room.code}</span>
  </section>

  {#if arcade.results}
    <section>
      <h2>Final results</h2>
      <Leaderboard results={arcade.results} />
      <button class="primary" onclick={() => arcade.dismissResults()}>Play again</button>
    </section>
  {:else if view}
    <section class="game">
      <div class="meta">
        <span class="badge">{view.variant}</span>
        <span>Round {view.round} / {view.totalRounds}</span>
        <span class="answered">
          {view.answered.length} / {alive.length} answered
        </span>
      </div>

      {#if view.phase === "question" && view.variant !== "host-paced"}
        <Countdown deadline={view.deadline} timeMs={view.timeMs} />
      {/if}

      <p class="prompt">{view.question.prompt}</p>

      <div class="choices">
        {#each view.question.choices as choice, i (i)}
          <div
            class="choice"
            class:correct={view.phase !== "question" && i === view.correctIndex}
            class:dim={view.phase !== "question" && i !== view.correctIndex}
          >
            <span class="letter">{String.fromCharCode(65 + i)}</span>
            {choice}
          </div>
        {/each}
      </div>

      {#if view.variant === "survival"}
        <p class="survivors">{alive.length} of {view.contestants.length} still standing</p>
      {/if}

      {#if view.variant === "host-paced"}
        {#if view.phase === "question"}
          <button class="primary" onclick={() => arcade.advanceRound()}>
            Reveal answers
          </button>
        {:else if view.phase === "reveal"}
          <button class="primary" onclick={() => arcade.advanceRound()}>
            {view.round < view.totalRounds ? "Next round" : "Show results"}
          </button>
        {/if}
      {/if}

      <button class="ghost" onclick={() => arcade.endGame()}>End game</button>
    </section>
  {:else}
    {#if arcade.catalog}
      <GamePicker
        catalog={arcade.catalog}
        onstart={(gameId, variantId, config) => arcade.startGame(gameId, variantId, config)}
      />
    {/if}

    <section>
      <h2>Roster ({arcade.roster.length})</h2>
      <ul class="roster">
        {#each arcade.roster as p (p.id)}
          <li>
            <span class="dot" class:on={p.connected}></span>
            <span class="name">{p.name}</span>
            <span class="badge">{p.role}</span>
          </li>
        {/each}
      </ul>
    </section>

    {#if arcade.hostKey}
      <p class="hostkey">
        Co-host code: <span class="key">{arcade.hostKey}</span>
        <span class="hint">— share it only with people who should run the show</span>
      </p>
    {/if}

    <button class="ghost" onclick={() => arcade.leave()}>Leave</button>
  {/if}
{/if}

<style>
  form {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  input {
    flex: 1;
    min-width: 12rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #2b3040;
    background: #12141c;
    color: inherit;
  }
  button {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    border: none;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary {
    margin-top: 1rem;
  }
  .ghost {
    background: transparent;
    border: 1px solid #2b3040;
    color: #9aa1b1;
    margin-top: 1.5rem;
  }
  .code {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 1rem 0 2rem;
  }
  .code.compact {
    flex-direction: row;
    align-items: baseline;
    gap: 0.75rem;
    margin: 0.5rem 0 1.25rem;
  }
  .code .label {
    color: #9aa1b1;
    font-size: 0.85rem;
  }
  .code .value {
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: 0.25em;
  }
  .code.compact .value {
    font-size: 1.4rem;
  }
  .game {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    color: #9aa1b1;
  }
  .answered {
    margin-left: auto;
  }
  .prompt {
    font-size: 2rem;
    font-weight: 700;
    margin: 0.5rem 0;
  }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  @media (max-width: 540px) {
    .choices {
      grid-template-columns: 1fr;
    }
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 10px;
    background: #171a23;
    border: 1px solid #262a36;
    font-size: 1.15rem;
  }
  .choice.correct {
    border-color: #22c55e;
    background: #10241a;
  }
  .choice.dim {
    opacity: 0.55;
  }
  .letter {
    font-weight: 800;
    color: #9aa1b1;
  }
  .survivors {
    color: #9aa1b1;
    margin: 0;
  }
  .roster {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .roster li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: #4b5163;
  }
  .dot.on {
    background: #22c55e;
  }
  .name {
    flex: 1;
  }
  .badge {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9aa1b1;
    border: 1px solid #2b3040;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
  .error {
    color: #f87171;
  }
  .reconnecting {
    color: #facc15;
    border: 1px solid #4d4320;
    background: #221e0e;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
  }
  .notice {
    color: #93c5fd;
    border: 1px solid #1e3a5f;
    background: #0e1a2b;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
  }
  .hostkey {
    color: #9aa1b1;
    font-size: 0.9rem;
  }
  .hostkey .key {
    font-family: monospace;
    color: #e2e6f0;
    background: #171a23;
    border: 1px solid #262a36;
    border-radius: 6px;
    padding: 0.1rem 0.4rem;
  }
  .hostkey .hint {
    font-size: 0.8rem;
  }
</style>
