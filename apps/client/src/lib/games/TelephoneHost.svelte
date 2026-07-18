<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
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
    chains: {
      index: number;
      members: { participantId: string; name: string; done: boolean }[];
      active: string | null;
      submitted: boolean;
    }[];
    timelines: { index: number; members: string[]; timeline: Entry[] }[];
  }

  let { arcade }: { arcade: ArcadeClient } = $props();
  const view = $derived(arcade.game!.view as TeleView);
</script>

<section class="game">
  <div class="meta">
    <span class="badge">alpha</span>
    <span>Step {Math.min(view.step + 1, view.totalSteps)} / {view.totalSteps}</span>
  </div>

  {#if view.phase === "step"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
    <div class="chains">
      {#each view.chains as chain (chain.index)}
        <div class="chain">
          <span class="label">Chain {chain.index + 1}</span>
          <div class="links">
            {#each chain.members as member (member.participantId)}
              <span
                class="link"
                class:done={member.done}
                class:active={chain.active === member.participantId && !member.done}
              >
                {member.name}
              </span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="prompt">The gallery — how each prompt survived the swarm:</p>
    {#each view.timelines as chain (chain.index)}
      <div class="story">
        <span class="label">Chain {chain.index + 1}</span>
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
      </div>
    {/each}
    {#if view.phase === "gallery"}
      <button class="primary" onclick={() => arcade.advanceRound()}>Show results</button>
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
  .prompt {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0.5rem 0;
  }
  .chains,
  .story {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .chain {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .label {
    color: #9aa1b1;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .link {
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid #2b3040;
    color: #9aa1b1;
    font-size: 0.9rem;
  }
  .link.done {
    border-color: #22c55e;
    color: #22c55e;
  }
  .link.active {
    border-color: #3b82f6;
    color: #e2e6f0;
  }
  .timeline {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .timeline li {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
    max-width: 11rem;
  }
  .text {
    font-weight: 600;
  }
  .who {
    color: #9aa1b1;
    font-size: 0.8rem;
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
