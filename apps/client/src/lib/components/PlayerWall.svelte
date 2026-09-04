<script lang="ts">
  import { MAX_GUESSES, WORD_LENGTH, type PublicBoard } from '@arcade/cipher';
  import type { Participant, PlayerId } from '@arcade/core';

  interface Props {
    boards: PublicBoard[];
    participants: Participant[];
  }

  let { boards, participants }: Props = $props();

  const nameOf = (id: PlayerId): string =>
    participants.find((p) => p.id === id)?.displayName ?? 'Player';

  // Solvers first (fastest first), then the still-playing, then the busted.
  const ordered = $derived(
    [...boards].sort((a, b) => {
      if (a.solved !== b.solved) return a.solved ? -1 : 1;
      if (a.solved && b.solved) return (a.solvedElapsedMs ?? 0) - (b.solvedElapsedMs ?? 0);
      if (a.finished !== b.finished) return a.finished ? 1 : -1;
      return b.guessCount - a.guessCount;
    }),
  );

  const rows = (board: PublicBoard) => {
    const out: (string | null)[][] = [];
    for (let r = 0; r < MAX_GUESSES; r += 1) {
      const result = board.results[r];
      out.push(
        result === undefined
          ? new Array<null>(WORD_LENGTH).fill(null)
          : result.map((state) => state),
      );
    }
    return out;
  };
</script>

{#if boards.length === 0}
  <p class="muted empty">No boards yet — the wall fills in as people guess.</p>
{:else}
  <div class="wall">
    {#each ordered as board (board.playerId)}
      <figure class="card" class:solved={board.solved} class:busted={board.finished && !board.solved}>
        <div class="mini" aria-hidden="true">
          {#each rows(board) as row, r (r)}
            {#each row as state, c (c)}
              <span class="cell" data-state={state}></span>
            {/each}
          {/each}
        </div>
        <figcaption>
          <span class="who">{nameOf(board.playerId)}</span>
          <span class="meta">
            {#if board.solved}
              {board.guessCount}/{MAX_GUESSES} · {board.points ?? 0}
            {:else if board.finished}
              out
            {:else}
              {board.guessCount}/{MAX_GUESSES}
            {/if}
          </span>
        </figcaption>
      </figure>
    {/each}
  </div>
{/if}

<style>
  .empty {
    margin: 0;
    font-size: 0.9rem;
  }

  /* auto-fill keeps 100+ boards legible without a scrollbar per card. */
  .wall {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: var(--space-3);
  }

  .card {
    margin: 0;
    padding: var(--space-2);
    background: var(--surface-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-2);
    display: grid;
    gap: var(--space-2);
    transition: border-color var(--dur-fast) var(--ease);
  }

  .card.solved {
    border-color: var(--tile-correct);
    box-shadow: 0 0 0 1px var(--tile-correct) inset;
  }

  .card.busted {
    opacity: 0.55;
  }

  .mini {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 2px;
  }

  .cell {
    aspect-ratio: 1;
    border-radius: 2px;
    background: var(--surface-3);
  }

  .cell[data-state='correct'] {
    background: var(--tile-correct);
  }
  .cell[data-state='present'] {
    background: var(--tile-present);
  }
  .cell[data-state='absent'] {
    background: var(--tile-absent);
  }

  figcaption {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
    font-size: 0.72rem;
  }

  .who {
    font-weight: 600;
    /* min-width:0 is what actually lets a flex child ellipsize. */
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    font-family: var(--font-mono);
    font-size: 0.68rem;
    color: var(--text-3);
    white-space: nowrap;
    flex: 0 0 auto;
  }
</style>
