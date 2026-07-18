<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";

  interface Showdown {
    kind: "deal" | "expired";
    exact: Record<string, { name: string; asset: number; share: number; delta: number }>;
    advancer: string | null;
  }

  interface MergerView {
    phase: "negotiate" | "showdown" | "ended";
    round: number;
    deadline: number;
    timeMs: number;
    poolCount: number;
    pairs: {
      aName: string;
      bName: string;
      aOffered: boolean;
      bOffered: boolean;
      resolved: "deal" | "expired" | null;
      showdown: Showdown | null;
    }[];
    byeName: string | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as MergerView);
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round}</span>
    <span class="muted">{view.poolCount} still in play</span>
  </div>

  {#if view.phase === "negotiate"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
    <p class="prompt">Negotiations under way — nobody sees the other side's books.</p>
    <ul class="pairs">
      {#each view.pairs as pair, i (i)}
        <li>
          <span class="names">{pair.aName} × {pair.bName}</span>
          <span class="state">
            {pair.resolved === "deal"
              ? "Deal closed"
              : `${(pair.aOffered ? 1 : 0) + (pair.bOffered ? 1 : 0)} offers on the table`}
          </span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="prompt">The showdown — books open on the projector.</p>
    <div class="cards">
      {#each view.pairs as pair, i (i)}
        {#if pair.showdown}
          <div class="card" class:expired={pair.showdown.kind === "expired"}>
            <span class="names">{pair.aName} × {pair.bName}</span>
            {#each Object.entries(pair.showdown.exact) as [id, side] (id)}
              <span class="line">
                {side.name}: held ${side.asset} → ${side.share}
                <em class:gain={side.delta >= 0} class:loss={side.delta < 0}>
                  ({side.delta >= 0 ? "+" : "−"}${Math.abs(side.delta)})
                </em>
                {pair.showdown.advancer === id ? "· CEO" : ""}
              </span>
            {/each}
            {#if pair.showdown.kind === "expired"}
              <span class="state">Clock ran out — both exit.</span>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  {#if view.byeName}
    <p class="status">{view.byeName} rides this round out unpaired.</p>
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
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .names {
    font-weight: 700;
  }
  .state {
    color: #9aa1b1;
    font-size: 0.9rem;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
    gap: 0.75rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .card.expired {
    border-color: #4d4320;
  }
  .line {
    font-size: 0.95rem;
  }
  .gain {
    color: #22c55e;
    font-style: normal;
  }
  .loss {
    color: #f87171;
    font-style: normal;
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
</style>
