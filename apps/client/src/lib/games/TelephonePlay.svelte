<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import DrawCanvas from "./DrawCanvas.svelte";
  import DrawingView from "./DrawingView.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";

  type Entry =
    | { kind: "prompt"; text: string; byName?: string | null }
    | { kind: "text"; text: string; byName?: string | null }
    | { kind: "drawing"; strokes: [number, number][][]; byName?: string | null };

  interface TeleView {
    phase: "step" | "gallery" | "ended";
    step: number;
    totalSteps: number;
    deadline: number;
    timeMs: number;
    timelines: { index: number; members: string[]; timeline: Entry[] }[];
    you?: {
      chain: number;
      yourTurn: boolean;
      task: "draw" | "guess" | null;
      previous: Entry | null;
      submitted: boolean;
      position: number;
    } | null;
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as TeleView);
  const you = $derived(view.you ?? null);
  let guess = $state("");

  $effect(() => {
    void view.step;
    guess = "";
  });

  function submitDrawing(strokes: [number, number][][]) {
    arcade.sendGameMessage("tele:submit", { strokes });
  }

  function submitGuess(e: Event) {
    e.preventDefault();
    if (!guess.trim()) return;
    arcade.sendGameMessage("tele:submit", { text: guess.trim() });
  }
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Step {Math.min(view.step + 1, view.totalSteps)} / {view.totalSteps}</span>
  </div>

  {#if view.phase === "step"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  {#if !you}
    <p class="status">Game in progress — you're spectating this one.</p>
  {:else if view.phase === "step"}
    {#if you.yourTurn && you.previous}
      {#if you.task === "draw"}
        <p class="prompt">
          Draw this: <strong>{you.previous.kind !== "drawing" ? you.previous.text : "?"}</strong>
        </p>
        <DrawCanvas onsubmit={submitDrawing} />
      {:else}
        <p class="prompt">What is this?</p>
        {#if you.previous.kind === "drawing"}
          <DrawingView strokes={you.previous.strokes} />
        {/if}
        <form onsubmit={submitGuess}>
          <input placeholder="Your best guess" bind:value={guess} maxlength="200" />
          <button type="submit" disabled={!guess.trim()}>Send it down the line</button>
        </form>
      {/if}
    {:else if you.submitted}
      <p class="status">Passed down the line. Waiting on the other chains…</p>
    {:else}
      <p class="status">
        Chain {you.chain + 1} — you're number {you.position + 1} in line. Your turn comes at step
        {you.position + 1}.
      </p>
    {/if}
  {:else}
    <p class="prompt">The unraveling of chain {you.chain + 1}:</p>
    {#each view.timelines as chain (chain.index)}
      <ol class="timeline">
        {#each chain.timeline as entry, i (i)}
          <li>
            {#if entry.kind === "drawing"}
              <DrawingView strokes={entry.strokes} small />
            {:else}
              <span class="text">{entry.text}</span>
            {/if}
            <span class="who">{entry.kind === "prompt" ? "prompt" : (entry.byName ?? "nobody")}</span>
          </li>
        {/each}
      </ol>
    {/each}
    <p class="status">Watch the host screen for every chain's story.</p>
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
  .prompt {
    font-size: 1.25rem;
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
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .timeline li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .text {
    font-weight: 600;
    flex: 1;
  }
  .who {
    color: #9aa1b1;
    font-size: 0.8rem;
    margin-left: auto;
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
