<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";

  interface SosView {
    phase: "pairing" | "decide" | "reveal" | "ended";
    round: number;
    deadline: number;
    timeMs: number;
    poolCount: number;
    you?: {
      stake: number;
      banked: number;
      eliminatedRound: number | null;
      bye: boolean;
      pair: {
        partnerName: string;
        pot: number;
        yourChoice: "split" | "steal" | null;
        partnerChose: boolean;
        outcome: "double-split" | "split-steal" | "double-steal" | null;
        partnerChoice: "split" | "steal" | null;
      } | null;
    } | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as SosView);
  const you = $derived(view.you ?? null);
  const pair = $derived(you?.pair ?? null);

  function choose(choice: "split" | "steal") {
    arcade.sendGameMessage("sos:choice", { choice });
  }

  function outcomeLine(): string {
    if (!pair || !pair.outcome) return "";
    if (pair.outcome === "double-split") {
      return `You both split — $${pair.pot / 2} each goes to the bank.`;
    }
    if (pair.outcome === "double-steal") {
      return "You both stole. The pot burns and you're both out.";
    }
    return pair.yourChoice === "steal"
      ? `You stole the whole $${pair.pot}. ${pair.partnerName} is out.`
      : `${pair.partnerName} stole the pot. You're out.`;
  }
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round}</span>
    <span class="muted">{view.poolCount} in the pool</span>
  </div>

  {#if !you}
    <p class="status">Game in progress — you're spectating this one.</p>
  {:else if pair && view.phase === "reveal" && pair.outcome}
    <p class="prompt">{outcomeLine()}</p>
    <p class="status" class:out={you.eliminatedRound !== null}>
      They chose <strong>{pair.partnerChoice}</strong> — you chose
      <strong>{pair.yourChoice}</strong>.
      {you.eliminatedRound !== null ? "You're out of the pool." : "You live to play again."}
    </p>
  {:else if you.eliminatedRound !== null}
    <p class="status out">Out in round {you.eliminatedRound}. Banked ${you.banked}.</p>
  {:else if you.bye}
    <p class="status">No partner this round — you sit this one out.</p>
  {:else if pair}
    {#if view.phase === "pairing"}
      <p class="prompt">
        Find <strong>{pair.partnerName}</strong>. You're playing for <strong>${pair.pot}</strong>.
      </p>
      <p class="status">Look them in the eye. The host starts the clock.</p>
    {:else if view.phase === "decide"}
      <Countdown deadline={view.deadline} timeMs={view.timeMs} />
      <p class="prompt">${pair.pot} on the table with {pair.partnerName}.</p>
      {#if pair.yourChoice}
        <p class="status">
          You chose <strong>{pair.yourChoice}</strong>.
          {pair.partnerChose ? "They've decided too…" : "They're still thinking…"}
        </p>
      {:else}
        <div class="decision">
          <button class="split" onclick={() => choose("split")}>Split</button>
          <button class="steal" onclick={() => choose("steal")}>Steal</button>
        </div>
      {/if}
    {/if}
  {/if}

  {#if you && you.eliminatedRound === null}
    <p class="bank">Banked ${you.banked} · Active stake ${you.stake}</p>
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
  .decision {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  .decision button {
    padding: 1.5rem;
    font-size: 1.35rem;
    font-weight: 800;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    color: white;
  }
  .split {
    background: #16a34a;
  }
  .steal {
    background: #dc2626;
  }
  .status {
    color: #9aa1b1;
    margin: 0;
  }
  .status.out {
    color: #f87171;
  }
  .bank {
    color: #9aa1b1;
    font-size: 0.9rem;
    margin: 0;
    border-top: 1px solid #262a36;
    padding-top: 0.75rem;
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
