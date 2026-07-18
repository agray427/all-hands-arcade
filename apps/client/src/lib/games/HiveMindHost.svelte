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
    names: Record<string, string>;
    eliminatedAt: Record<string, number>;
    tally: { answer: string; count: number; surviving: boolean }[];
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as HiveView);
  const droppedThisRound = $derived(
    Object.entries(view.eliminatedAt)
      .filter(([, round]) => round === view.round)
      .map(([id]) => view.names[id] ?? "?"),
  );
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round} / {view.totalRounds}</span>
    <span class="muted">{view.answeredCount} / {view.aliveCount} answered</span>
  </div>

  {#if view.phase === "prompt"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  <p class="prompt">{view.prompt}</p>

  {#if view.phase !== "prompt"}
    <ul class="tally">
      {#each view.tally as entry (entry.answer)}
        <li class:surviving={entry.surviving}>
          <span>{entry.answer}</span>
          <span class="count">{entry.count}</span>
        </li>
      {/each}
    </ul>
    {#if droppedThisRound.length > 0}
      <p class="status out">Out this round: {droppedThisRound.join(", ")}</p>
    {:else}
      <p class="status good">The hive survives intact.</p>
    {/if}
  {/if}
</section>

<style>
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
  .muted {
    margin-left: auto;
  }
  .prompt {
    font-size: 2rem;
    font-weight: 700;
    margin: 0.5rem 0;
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
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
    font-size: 1.15rem;
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
  .status.good {
    color: #22c55e;
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
