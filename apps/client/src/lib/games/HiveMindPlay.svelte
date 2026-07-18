<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";

  interface HiveView {
    phase: "prompt" | "reveal" | "ended";
    round: number;
    totalRounds: number;
    prompt: string;
    deadline: number;
    timeMs: number;
    answeredCount: number;
    aliveCount: number;
    tally: { answer: string; count: number; surviving: boolean }[];
    you?: { answer: string | null; eliminatedRound: number | null } | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as HiveView);
  const you = $derived(view.you ?? null);
  let draft = $state("");

  $effect(() => {
    void view.round;
    draft = "";
  });

  function submit(e: Event) {
    e.preventDefault();
    if (!draft.trim()) return;
    arcade.sendGameMessage("hive:answer", { text: draft.trim() });
  }
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round} / {view.totalRounds}</span>
    <span class="muted">{view.aliveCount} in the hive</span>
  </div>

  {#if view.phase === "prompt"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  <p class="prompt">{view.prompt}</p>

  {#if !you}
    <p class="status">Game in progress — you're spectating this one.</p>
  {:else if you.eliminatedRound !== null}
    <p class="status out">Cast out of the hive in round {you.eliminatedRound}.</p>
  {:else if view.phase === "prompt"}
    {#if you.answer !== null}
      <p class="status">You said <strong>{you.answer}</strong>. Hope the hive agrees…</p>
    {:else}
      <form onsubmit={submit}>
        <input placeholder="Type what the swarm would type" bind:value={draft} maxlength="60" />
        <button type="submit" disabled={!draft.trim()}>Answer</button>
      </form>
    {/if}
  {/if}

  {#if view.phase !== "prompt" && view.tally.length > 0}
    <ul class="tally">
      {#each view.tally as entry (entry.answer)}
        <li class:surviving={entry.surviving}>
          <span class="answer">{entry.answer}</span>
          <span class="count">{entry.count}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .game {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1rem;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    color: #9aa1b1;
  }
  .muted {
    margin-left: auto;
  }
  .prompt {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0.25rem 0;
  }
  form {
    display: flex;
    gap: 0.5rem;
  }
  input {
    flex: 1;
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
  .tally {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tally li {
    display: flex;
    justify-content: space-between;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .tally li.surviving {
    border-color: #22c55e;
    background: #10241a;
  }
  .count {
    font-weight: 800;
  }
  .status {
    color: #9aa1b1;
    margin: 0;
  }
  .status.out {
    color: #f87171;
  }
  .badge {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fbbf24;
    border: 1px solid #4d4320;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
</style>
