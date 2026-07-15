<script lang="ts">
  import { onMount } from "svelte";
  import { ArcadeClient } from "$lib/arcade.svelte";
  import Countdown from "$lib/components/Countdown.svelte";
  import Leaderboard from "$lib/components/Leaderboard.svelte";

  const arcade = new ArcadeClient();
  let roomCode = $state("");
  let name = $state("");
  let asHost = $state(false);

  onMount(() => {
    void arcade.resume();
  });

  const view = $derived(arcade.game?.view ?? null);
  const youId = $derived(arcade.you?.id ?? "");
  const isContestant = $derived(!!view && view.contestants.includes(youId));
  const eliminatedRound = $derived(view ? view.eliminatedAt[youId] : undefined);
  const hasAnswered = $derived(
    arcade.myChoice !== null || (!!view && view.answered.includes(youId)),
  );
  const outcome = $derived(view?.outcomes?.[youId]);
  const myPlacement = $derived(
    arcade.results?.find((entry) => entry.participantId === youId) ?? null,
  );

  const canAnswer = $derived(
    !!view &&
      view.phase === "question" &&
      isContestant &&
      eliminatedRound === undefined &&
      !hasAnswered,
  );

  function join() {
    const code = roomCode.trim().toUpperCase();
    const who = name.trim();
    if (code && who) arcade.joinRoom(code, who, asHost);
  }
</script>

<h1>Join</h1>

{#if arcade.lastError}
  <p class="error">{arcade.lastError}</p>
{/if}

{#if arcade.room && !arcade.connected}
  <p class="reconnecting">Connection lost — reconnecting…</p>
{/if}

{#if !arcade.room && arcade.notice}
  <p class="notice">{arcade.notice}</p>
{/if}

{#if !arcade.room}
  <form onsubmit={(e) => { e.preventDefault(); join(); }}>
    <input placeholder="Room code" bind:value={roomCode} style="text-transform: uppercase" />
    <input placeholder="Your name" bind:value={name} />
    <label class="check">
      <input type="checkbox" bind:checked={asHost} />
      Join as host
    </label>
    <button type="submit" disabled={!roomCode.trim() || !name.trim()}>Join</button>
  </form>
{:else if arcade.results}
  <section class="results">
    <h2>Final results</h2>
    {#if myPlacement}
      <p class="placement">
        You finished <strong>#{myPlacement.rank}</strong>{myPlacement.detail
          ? ` — ${myPlacement.detail}`
          : ""}.
      </p>
    {/if}
    <Leaderboard results={arcade.results} {youId} />
  </section>
{:else if view}
  <section class="game">
    <div class="meta">
      <span class="badge">{view.variant}</span>
      <span>Round {view.round} / {view.totalRounds}</span>
    </div>

    {#if view.phase === "question"}
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
      <p class="status out">You're out — eliminated in round {eliminatedRound}.</p>
    {:else if view.phase === "question" && hasAnswered}
      <p class="status">Answer locked in. Waiting for the reveal…</p>
    {:else if view.phase === "reveal" && outcome}
      <p class="status" class:good={outcome === "correct"} class:out={outcome !== "correct"}>
        {outcome === "correct"
          ? "Correct!"
          : outcome === "wrong"
            ? "Wrong answer."
            : "Too slow!"}
      </p>
    {/if}
  </section>
{:else}
  <p class="joined">
    You joined <strong>{arcade.room.code}</strong> as
    <strong>{arcade.you?.role}</strong>. Waiting for the host to start a game.
  </p>

  <section>
    <h2>Roster ({arcade.roster.length})</h2>
    <ul class="roster">
      {#each arcade.roster as p (p.id)}
        <li>
          <span class="dot" class:on={p.connected}></span>
          <span class="name">{p.name}</span>
          <span class="badge">{p.role}</span>
        </li>
      {/each}
    </ul>
  </section>

  <button class="ghost" onclick={() => arcade.leave()}>Leave</button>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 20rem;
  }
  input {
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #2b3040;
    background: #12141c;
    color: inherit;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #9aa1b1;
    font-size: 0.9rem;
  }
  .check input {
    width: auto;
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
  .ghost {
    background: transparent;
    border: 1px solid #2b3040;
    color: #9aa1b1;
    margin-top: 1.5rem;
  }
  .joined {
    margin: 1rem 0 1.5rem;
  }
  .game,
  .results {
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
  .placement {
    margin: 0;
  }
  .roster {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .roster li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: #4b5163;
  }
  .dot.on {
    background: #22c55e;
  }
  .name {
    flex: 1;
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
  .error {
    color: #f87171;
  }
  .reconnecting {
    color: #facc15;
    border: 1px solid #4d4320;
    background: #221e0e;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
  }
  .notice {
    color: #93c5fd;
    border: 1px solid #1e3a5f;
    background: #0e1a2b;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
  }
</style>
