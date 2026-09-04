<script lang="ts">
  import type { LeaderboardEntry } from '@arcade/core';
  import { flip } from 'svelte/animate';

  interface Props {
    entries: LeaderboardEntry[];
    highlight?: string | null;
    roundCount?: number;
    compact?: boolean;
    limit?: number;
  }

  let { entries, highlight = null, roundCount = 0, compact = false, limit = 0 }: Props = $props();

  const shown = $derived(limit > 0 ? entries.slice(0, limit) : entries);
  const hidden = $derived(Math.max(0, entries.length - shown.length));
  // Until a round resolves nobody has points, so ranking the room 1st-equal is
  // noise. Show the roster without positions instead.
  const scoringStarted = $derived(entries.some((e) => e.totalPoints > 0));
  // Before the first round resolves everyone is on zero. Handing the whole room
  // a gold medal reads as a bug, so medals only appear once points exist.
  const medal = (entry: LeaderboardEntry): string =>
    entry.totalPoints === 0 ? '' : entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '';
</script>

{#if entries.length === 0}
  <p class="muted empty">Nobody has scored yet.</p>
{:else}
  <ol class="board" class:compact>
    {#each shown as entry (entry.playerId)}
      <li
        animate:flip={{ duration: 420 }}
        class:me={entry.playerId === highlight}
        class:podium={entry.rank <= 3 && entry.totalPoints > 0}
      >
        <span class="rank">{scoringStarted ? medal(entry) || entry.rank : '–'}</span>
        <span class="name">{entry.displayName}</span>
        {#if !compact && roundCount > 1}
          <span class="rounds">
            {#each entry.roundPoints.slice(0, roundCount) as points, i (i)}
              <span class="chip" class:zero={points === 0}>{points}</span>
            {/each}
          </span>
        {/if}
        <span class="total">{entry.totalPoints.toLocaleString()}</span>
      </li>
    {/each}
  </ol>
  {#if hidden > 0}
    <p class="muted more">+{hidden} more</p>
  {/if}
{/if}

<style>
  .empty {
    margin: 0;
    font-size: 0.9rem;
  }

  .board {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-2);
    /* A 100-player room would otherwise run off the bottom of the page. */
    max-height: min(62vh, 40rem);
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .more {
    margin: var(--space-2) 0 0;
    font-size: 0.8rem;
    text-align: center;
  }

  li {
    display: grid;
    grid-template-columns: 2rem 1fr auto auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--surface-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-2);
  }

  .compact li {
    padding: var(--space-2) var(--space-3);
    grid-template-columns: 2rem 1fr auto;
  }

  li.podium {
    background: linear-gradient(90deg, rgba(86, 209, 196, 0.12), var(--surface-2) 45%);
    border-color: var(--border-2);
  }

  li.me {
    outline: 2px solid var(--accent);
  }

  .rank {
    font-weight: 800;
    color: var(--text-2);
    text-align: center;
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rounds {
    display: flex;
    gap: 4px;
  }

  .chip {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: var(--radius-pill);
    background: var(--surface-3);
    color: var(--text-2);
  }

  .chip.zero {
    opacity: 0.4;
  }

  .total {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 1.05rem;
    min-width: 3.5rem;
    text-align: right;
  }
</style>
