<script lang="ts">
  import Countdown from "../components/Countdown.svelte";
  import type { ArcadeClient } from "$lib/arcade.svelte";
  import type { TriviaView } from "../trivia-view.js";

  let { arcade }: { arcade: ArcadeClient } = $props();

  const view = $derived(arcade.game!.view as TriviaView);
  const youId = $derived(arcade.you?.id ?? "");
  const isContestant = $derived(view.contestants.includes(youId));
  const eliminatedRound = $derived(view.eliminatedAt[youId]);
  const hasAnswered = $derived(
    arcade.myChoice !== null || view.answered.includes(youId),
  );
  const outcome = $derived(view.outcomes?.[youId]);

  const canAnswer = $derived(
    view.phase === "question" &&
      isContestant &&
      eliminatedRound === undefined &&
      !hasAnswered,
  );
</script>

<section class="game">
  <div class="meta">
    <span class="badge">{view.variant}</span>
    <span>Round {view.round} / {view.totalRounds}</span>
  </div>

  {#if view.phase === "question" && view.variant !== "host-paced"}
    <Countdown deadline={view.deadline} timeMs={view.timeMs} />
  {/if}

  <p class="prompt">{view.question.prompt}</p>

  <div class="choices">
    {#each view.question.choices as choice, i (i)}
      <button
        class="choice"
        class:picked={arcade.myChoice === i}
        class:correct={view.phase !== "question" && i === view.correctIndex}
        class:wrong={view.phase !== "question" &&
          arcade.myChoice === i &&
          i !== view.correctIndex}
        disabled={!canAnswer}
        onclick={() => arcade.submitAnswer(i)}
      >
        <span class="letter">{String.fromCharCode(65 + i)}</span>
        {choice}
      </button>
    {/each}
  </div>

  {#if !isContestant}
    <p class="status">Game in progress — you're spectating this one.</p>
  {:else if eliminatedRound !== undefined}
    <p class="status out">
      {view.outcomes?.[youId] === "absent" && eliminatedRound === view.round
        ? `Connection dropped — you're out, eliminated in round ${eliminatedRound}.`
        : `You're out — eliminated in round ${eliminatedRound}.`}
    </p>
  {:else if view.phase === "question" && hasAnswered}
    <p class="status">Answer locked in. Waiting for the reveal…</p>
  {:else if view.phase === "reveal" && outcome}
    <p class="status" class:good={outcome === "correct"} class:out={outcome !== "correct"}>
      {outcome === "correct"
        ? "Correct!"
        : outcome === "wrong"
          ? "Wrong answer."
          : outcome === "absent"
            ? "Connection dropped — this one didn't reach you."
            : view.variant === "host-paced"
              ? "No answer."
              : "Too slow!"}
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
  .prompt {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0.25rem 0;
  }
  .choices {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.9rem 1rem;
    border-radius: 10px;
    background: #171a23;
    border: 1px solid #262a36;
    color: inherit;
    font-size: 1.05rem;
    text-align: left;
    cursor: pointer;
  }
  .choice:disabled {
    cursor: default;
    opacity: 0.85;
  }
  .choice.picked {
    border-color: #3b82f6;
    background: #101726;
  }
  .choice.correct {
    border-color: #22c55e;
    background: #10241a;
    opacity: 1;
  }
  .choice.wrong {
    border-color: #f87171;
    background: #241014;
  }
  .letter {
    font-weight: 800;
    color: #9aa1b1;
  }
  .status {
    color: #9aa1b1;
    margin: 0;
  }
  .status.good {
    color: #22c55e;
  }
  .status.out {
    color: #f87171;
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
</style>
