<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";

  interface JuryView {
    phase: "clue" | "vote" | "reveal" | "ended";
    round: number;
    roundsToWin: number;
    deadline: number;
    timeMs: number;
    cluesIn: number;
    votesIn: number;
    aliveCount: number;
    cloud: { word: string; count: number }[];
    entries: { participantId: string; name: string; clue: string | null }[];
    lastEliminated: { participantId: string; name: string; role: string }[];
    winner: "jurors" | "saboteurs" | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as JuryView);
  const maxCount = $derived(Math.max(1, ...view.cloud.map((c) => c.count)));
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round} / {view.roundsToWin}</span>
    <span class="muted">
      {view.phase === "clue"
        ? `${view.cluesIn} / ${view.aliveCount} clues in`
        : view.phase === "vote"
          ? `${view.votesIn} / ${view.aliveCount} votes in`
          : `${view.aliveCount} standing`}
    </span>
  </div>

  {#if view.phase === "clue" || view.phase === "vote"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  {#if view.phase === "clue"}
    <p class="prompt">Clues are coming in…</p>
  {:else}
    <div class="cloud">
      {#each view.cloud as item (item.word)}
        <span style="font-size: {0.9 + (item.count / maxCount) * 1.6}rem">{item.word}</span>
      {/each}
    </div>
    <ul class="entries">
      {#each view.entries as entry (entry.participantId)}
        <li>
          <span class="clue">{entry.clue ?? "—"}</span>
          <span class="who">{entry.name}</span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if view.phase === "reveal"}
    {#each view.lastEliminated as gone (gone.participantId)}
      <p class="status out">
        <strong>{gone.name}</strong> was voted out — a <strong>{gone.role}</strong>.
      </p>
    {:else}
      <p class="status">Nobody was voted out this round.</p>
    {/each}
  {/if}

  {#if view.winner}
    <p class="status good">
      {view.winner === "jurors" ? "The jury prevails!" : "The saboteurs win!"}
    </p>
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
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0.5rem 0;
    color: #9aa1b1;
  }
  .cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: baseline;
    padding: 1rem;
    border-radius: 12px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .entries {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.5rem;
  }
  .entries li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .clue {
    font-weight: 700;
  }
  .who {
    color: #9aa1b1;
    font-size: 0.85rem;
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
