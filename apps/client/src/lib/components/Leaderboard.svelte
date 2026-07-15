<script lang="ts">
  import type { GameResults } from "@arcade/core";

  let { results, youId }: { results: GameResults; youId?: string } = $props();
</script>

<ol class="leaderboard">
  {#each results as entry (entry.participantId)}
    <li class:you={entry.participantId === youId}>
      <span class="rank">#{entry.rank}</span>
      <span class="name">
        {entry.name}{entry.participantId === youId ? " (you)" : ""}
      </span>
      {#if entry.detail}
        <span class="detail">{entry.detail}</span>
      {/if}
      <span class="score">{entry.score}</span>
    </li>
  {/each}
</ol>

<style>
  .leaderboard {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  li.you {
    border-color: #3b82f6;
  }
  .rank {
    font-weight: 800;
    color: #9aa1b1;
    min-width: 2rem;
  }
  .name {
    flex: 1;
  }
  .detail {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9aa1b1;
    border: 1px solid #2b3040;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
  .score {
    font-weight: 700;
  }
</style>
