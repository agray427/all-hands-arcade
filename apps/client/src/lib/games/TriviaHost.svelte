<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";
  import type { TriviaView } from "../trivia-view.js";

  let { arcade }: { arcade: ArcadeClient } = $props();

  const view = $derived(arcade.game!.view as TriviaView);
  const alive = $derived(
    view.contestants.filter((id) => view.eliminatedAt[id] === undefined),
  );
</script>

<section class="game">
  <div class="meta">
    <span class="badge">{view.variant}</span>
    <span>Round {view.round} / {view.totalRounds}</span>
    <span class="answered">
      {view.answered.length} / {alive.length} answered
    </span>
  </div>

  {#if view.phase === "question" && view.variant !== "host-paced"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  <p class="prompt">{view.question.prompt}</p>

  <div class="choices">
    {#each view.question.choices as choice, i (i)}
      <div
        class="choice"
        class:correct={view.phase !== "question" && i === view.correctIndex}
        class:dim={view.phase !== "question" && i !== view.correctIndex}
      >
        <span class="letter">{String.fromCharCode(65 + i)}</span>
        {choice}
      </div>
    {/each}
  </div>

  {#if view.variant === "survival"}
    <p class="survivors">{alive.length} of {view.contestants.length} still standing</p>
  {/if}

  {#if view.variant === "host-paced"}
    {#if view.phase === "question"}
      <button class="primary" onclick={() => arcade.advanceRound()}>
        Reveal answers
      </button>
    {:else if view.phase === "reveal"}
      <button class="primary" onclick={() => arcade.advanceRound()}>
        {view.round < view.totalRounds ? "Next round" : "Show results"}
      </button>
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
  .answered {
    margin-left: auto;
  }
  .prompt {
    font-size: 2rem;
    font-weight: 700;
    margin: 0.5rem 0;
  }
  .choices {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }
  @media (max-width: 540px) {
    .choices {
      grid-template-columns: 1fr;
    }
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 10px;
    background: #171a23;
    border: 1px solid #262a36;
    font-size: 1.15rem;
  }
  .choice.correct {
    border-color: #22c55e;
    background: #10241a;
  }
  .choice.dim {
    opacity: 0.55;
  }
  .letter {
    font-weight: 800;
    color: #9aa1b1;
  }
  .survivors {
    color: #9aa1b1;
    margin: 0;
  }
  .badge {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9aa1b1;
    border: 1px solid #2b3040;
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
    margin-top: 1rem;
    align-self: flex-start;
  }
</style>
