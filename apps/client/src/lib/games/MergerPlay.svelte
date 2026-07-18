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
    you?: {
      asset: number | null;
      banked: number | null;
      startingAsset: number;
      exitedRound: number | null;
      bye: boolean;
      pair: {
        partnerName: string;
        partnerEstimate: { minEst: number; maxEst: number } | null;
        yourOffer: number | null;
        partnerOffer: number | null;
        resolved: "deal" | "expired" | null;
        acceptedByYou: boolean;
        showdown: Showdown | null;
      } | null;
    } | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as MergerView);
  const you = $derived(view.you ?? null);
  const pair = $derived(you?.pair ?? null);
  const youId = $derived(arcade.you?.id ?? "");

  let pct = $state(50);

  const walkaway = $derived.by(() => {
    if (!you || you.asset === null || !pair?.partnerEstimate) return null;
    const low = ((you.asset + pair.partnerEstimate.minEst) * pct) / 100;
    const high = ((you.asset + pair.partnerEstimate.maxEst) * pct) / 100;
    return { low: Math.round(low), high: Math.round(high) };
  });

  function makeOffer() {
    arcade.sendGameMessage("merger:offer", { pct });
  }

  function acceptOffer() {
    arcade.sendGameMessage("merger:accept", {});
  }
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round}</span>
    <span class="muted">{view.poolCount} still in play</span>
  </div>

  {#if !you}
    <p class="status">Game in progress — you're spectating this one.</p>
  {:else if pair && pair.showdown}
    <p class="prompt">
      {pair.showdown.kind === "expired" ? "The clock ran out — no merger." : "The books open."}
    </p>
    <div class="showdown">
      {#each Object.entries(pair.showdown.exact) as [id, side] (id)}
        <div class="side" class:yours={id === youId}>
          <span class="who">{id === youId ? "You" : side.name}</span>
          <span>Held ${side.asset}</span>
          <span>Walked with ${side.share}</span>
          <span class:gain={side.delta >= 0} class:loss={side.delta < 0}>
            Δ {side.delta >= 0 ? "+" : "−"}${Math.abs(side.delta)}
          </span>
          {#if pair.showdown.advancer === id}
            <span class="ceo">CEO — advances</span>
          {/if}
        </div>
      {/each}
    </div>
  {:else if you.exitedRound !== null}
    <p class="status out">
      You exited in round {you.exitedRound} banking ${you.banked ?? 0}.
    </p>
  {:else if you.bye}
    <p class="status">No merger partner this round — your assets ride along untouched.</p>
  {:else if pair && view.phase === "negotiate"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
    <p class="prompt">Merger talks with <strong>{pair.partnerName}</strong></p>
    <div class="books">
      <span>Your assets: <strong>${you.asset}</strong></span>
      {#if pair.partnerEstimate}
        <span>
          Their books (est.): <strong>${pair.partnerEstimate.minEst}–${pair.partnerEstimate.maxEst}</strong>
        </span>
      {/if}
    </div>

    <label class="slider">
      <span>You keep <strong>{pct}%</strong> of the merged company</span>
      <input type="range" min="0" max="100" bind:value={pct} />
    </label>
    {#if walkaway}
      <p class="status">
        You'd walk away with an estimated <strong>${walkaway.low}–${walkaway.high}</strong>.
      </p>
    {/if}
    <div class="actions">
      <button onclick={makeOffer}>
        {pair.yourOffer === null ? `Offer to keep ${pct}%` : `Update offer (was ${pair.yourOffer}%)`}
      </button>
      {#if pair.partnerOffer !== null}
        <button class="accept" onclick={acceptOffer}>
          Accept their terms — you'd keep {100 - pair.partnerOffer}%
        </button>
      {/if}
    </div>
    {#if pair.partnerOffer !== null}
      <p class="status">
        {pair.partnerName} wants {pair.partnerOffer}%, leaving you {100 - pair.partnerOffer}%.
      </p>
    {:else}
      <p class="status">No offer from {pair.partnerName} yet.</p>
    {/if}
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
  .books {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .books span {
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .slider {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  input[type="range"] {
    width: 100%;
    accent-color: #3b82f6;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  button {
    padding: 0.75rem 1rem;
    border-radius: 8px;
    border: none;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }
  .accept {
    background: #16a34a;
  }
  .showdown {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  @media (max-width: 540px) {
    .showdown {
      grid-template-columns: 1fr;
    }
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .side.yours {
    border-color: #3b82f6;
  }
  .who {
    font-weight: 800;
  }
  .gain {
    color: #22c55e;
  }
  .loss {
    color: #f87171;
  }
  .ceo {
    color: #fbbf24;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
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
