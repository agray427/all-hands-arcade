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
    you?: {
      role: "juror" | "saboteur";
      target: string | null;
      category: string;
      clue: string | null;
      vote: string | null;
      eliminatedRound: number | null;
    } | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as JuryView);
  const you = $derived(view.you ?? null);
  const youId = $derived(arcade.you?.id ?? "");
  let draft = $state("");

  $effect(() => {
    void view.round;
    draft = "";
  });

  function submitClue(e: Event) {
    e.preventDefault();
    if (!draft.trim()) return;
    arcade.sendGameMessage("jury:clue", { word: draft.trim() });
  }

  function castVote(target: string) {
    arcade.sendGameMessage("jury:vote", { target });
  }
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Round {view.round} / {view.roundsToWin}</span>
    <span class="muted">{view.aliveCount} standing</span>
  </div>

  {#if you && you.eliminatedRound === null}
    <p class="role" class:saboteur={you.role === "saboteur"}>
      {#if you.role === "juror"}
        You're a <strong>juror</strong>. The word is <strong>{you.target}</strong>.
      {:else}
        You're the <strong>saboteur</strong>. All you know: <strong>{you.category}</strong>. Blend in.
      {/if}
    </p>
  {/if}

  {#if view.phase === "clue" || view.phase === "vote"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  {#if !you}
    <p class="status">Game in progress — you're spectating this one.</p>
  {:else if you.eliminatedRound !== null}
    <p class="status out">Voted out in round {you.eliminatedRound}.</p>
  {:else if view.phase === "clue"}
    {#if you.clue !== null}
      <p class="status">Clue submitted: <strong>{you.clue}</strong>. Waiting for the rest…</p>
    {:else}
      <form onsubmit={submitClue}>
        <input placeholder="One-word clue" bind:value={draft} maxlength="24" />
        <button type="submit" disabled={!draft.trim()}>Submit clue</button>
      </form>
    {/if}
  {:else if view.phase === "vote"}
    <p class="status">Vote for the clue that smells like a saboteur.</p>
    <ul class="entries">
      {#each view.entries.filter((e) => e.participantId !== youId) as entry (entry.participantId)}
        <li>
          <span class="clue">{entry.clue ?? "—"}</span>
          <span class="who">{entry.name}</span>
          <button
            class="vote"
            class:cast={you.vote === entry.participantId}
            disabled={you.vote !== null}
            onclick={() => castVote(entry.participantId)}
          >
            {you.vote === entry.participantId ? "Voted" : "Vote"}
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if view.phase === "reveal"}
    {#each view.lastEliminated as gone (gone.participantId)}
      <p class="status out">
        <strong>{gone.name}</strong> was voted out — they were a <strong>{gone.role}</strong>.
      </p>
    {:else}
      <p class="status">Nobody was voted out this round.</p>
    {/each}
  {/if}

  {#if view.winner}
    <p class="status" class:good={true}>
      {view.winner === "jurors" ? "The jury prevails!" : "The saboteurs win!"}
    </p>
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
  .role {
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #0e1a2b;
    border: 1px solid #1e3a5f;
    color: #93c5fd;
    margin: 0;
  }
  .role.saboteur {
    background: #241014;
    border-color: #4d2020;
    color: #f87171;
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
  .entries {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .entries li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .clue {
    font-weight: 700;
    flex: 1;
  }
  .who {
    color: #9aa1b1;
    font-size: 0.85rem;
  }
  .vote.cast {
    background: #22c55e;
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
