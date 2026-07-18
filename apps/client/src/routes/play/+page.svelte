<script lang="ts">
  import { onMount } from "svelte";
  import { ArcadeClient } from "$lib/arcade.svelte";
  import Leaderboard from "$lib/components/Leaderboard.svelte";
  import { gameScreens } from "$lib/games/registry.js";

  const arcade = new ArcadeClient();
  let roomCode = $state("");
  let name = $state("");
  let asHost = $state(false);
  let hostKey = $state("");

  onMount(() => {
    void arcade.resume();
  });

  const youId = $derived(arcade.you?.id ?? "");
  const screens = $derived(arcade.game ? (gameScreens[arcade.game.gameId] ?? null) : null);
  const myPlacement = $derived(
    arcade.results?.find((entry) => entry.participantId === youId) ?? null,
  );

  function join() {
    const code = roomCode.trim().toUpperCase();
    const who = name.trim();
    if (code && who) arcade.joinRoom(code, who, asHost, hostKey.trim() || undefined);
  }
</script>

<h1>Join</h1>

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
  <form onsubmit={(e) => { e.preventDefault(); join(); }}>
    <input placeholder="Room code" bind:value={roomCode} style="text-transform: uppercase" />
    <input placeholder="Your name" bind:value={name} />
    <label class="check">
      <input type="checkbox" bind:checked={asHost} />
      Join as host
    </label>
    {#if asHost}
      <input placeholder="Host code" bind:value={hostKey} />
    {/if}
    <button
      type="submit"
      disabled={!roomCode.trim() || !name.trim() || (asHost && !hostKey.trim())}
    >
      Join
    </button>
  </form>
{:else if arcade.results}
  <section class="results">
    <h2>Final results</h2>
    {#if myPlacement}
      <p class="placement">
        You finished <strong>#{myPlacement.rank}</strong>{myPlacement.detail
          ? ` — ${myPlacement.detail}`
          : ""}.
      </p>
    {/if}
    <Leaderboard results={arcade.results} {youId} />
  </section>
{:else if arcade.game}
  {#if screens}
    {@const PlayScreen = screens.play}
    <PlayScreen {arcade} />
  {:else}
    <p class="status">A game is running, but this client has no screen for it yet.</p>
  {/if}
{:else}
  <p class="joined">
    You joined <strong>{arcade.room.code}</strong> as
    <strong>{arcade.you?.role}</strong>. Waiting for the host to start a game.
  </p>

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

  <button class="ghost" onclick={() => arcade.leave()}>Leave</button>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 20rem;
  }
  input {
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #2b3040;
    background: #12141c;
    color: inherit;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #9aa1b1;
    font-size: 0.9rem;
  }
  .check input {
    width: auto;
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
  .ghost {
    background: transparent;
    border: 1px solid #2b3040;
    color: #9aa1b1;
    margin-top: 1.5rem;
  }
  .joined {
    margin: 1rem 0 1.5rem;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }
  .status {
    color: #9aa1b1;
    margin: 1rem 0 0;
  }
  .placement {
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
</style>
