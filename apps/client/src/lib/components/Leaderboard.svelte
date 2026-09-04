<script lang="ts">
  import type { ScoreEntry } from '@arcade/core';

  let {
    entries,
    highlight = null,
    title = 'Leaderboard',
  }: { entries: ScoreEntry[]; highlight?: string | null; title?: string } = $props();
</script>

<section class="board">
  <h3>{title}</h3>
  {#if entries.length === 0}
    <p class="muted">Nobody on the board yet.</p>
  {:else}
    <ol>
      {#each entries as entry (entry.playerId)}
        <li class:me={entry.playerId === highlight}>
          <span class="rank">{entry.rank}</span>
          <span class="name">{entry.name}</span>
          <span class="score">{entry.score}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  h3 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 12px;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  li {
    display: grid;
    grid-template-columns: 2.2rem 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: var(--panel-2);
    border: 1px solid transparent;
    border-radius: 10px;
  }

  li.me {
    border-color: var(--accent-2);
  }

  .rank {
    color: var(--muted);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .score {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    color: var(--accent-2);
  }
</style>
