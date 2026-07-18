<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";

  interface SosView {
    phase: "pairing" | "decide" | "reveal" | "ended";
    round: number;
    deadline: number;
    timeMs: number;
    poolCount: number;
    pairs: {
      aName: string;
      bName: string;
      pot: number;
      aChosen: boolean;
      bChosen: boolean;
      outcome: "double-split" | "split-steal" | "double-steal" | null;
      choices: Record<string, "split" | "steal"> | null;
    }[];
    byeName: string | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as SosView);

  const outcomeLabel: Record<string, string> = {
    "double-split": "Both split — pot shared",
    "split-steal": "Steal! Pot taken",
    "double-steal": "Double steal — pot burned",
  };
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round}</span>
    <span class="muted">{view.poolCount} in the pool</span>
  </div>

  {#if view.phase === "decide"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  {#if view.phase === "pairing"}
    <p class="prompt">Pairs are up — give everyone a moment to find each other.</p>
  {/if}

  <ul class="pairs">
    {#each view.pairs as pair, i (i)}
      <li class:burned={pair.outcome === "double-steal"}>
        <span class="names">{pair.aName} × {pair.bName}</span>
        <span class="pot">${pair.pot}</span>
        {#if view.phase === "decide"}
          <span class="chosen">{(pair.aChosen ? 1 : 0) + (pair.bChosen ? 1 : 0)} / 2 decided</span>
        {:else if pair.outcome}
          <span class="outcome">{outcomeLabel[pair.outcome]}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if view.byeName}
    <p class="status">{view.byeName} sits this round out.</p>
  {/if}

  {#if view.phase === "pairing"}
    <button class="primary" onclick={() => arcade.advanceRound()}>Start the timer</button>
  {:else if view.phase === "reveal"}
    <button class="primary" onclick={() => arcade.advanceRound()}>Next round</button>
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
  }
  .pairs {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .pairs li {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .pairs li.burned {
    border-color: #f87171;
  }
  .names {
    font-weight: 700;
    flex: 1;
  }
  .pot {
    font-weight: 800;
    color: #fbbf24;
  }
  .chosen,
  .outcome {
    color: #9aa1b1;
    font-size: 0.9rem;
  }
  .status {
    color: #9aa1b1;
    margin: 0;
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
  .primary {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    border: none;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    cursor: pointer;
    align-self: flex-start;
  }
</style>
