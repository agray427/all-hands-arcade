<script lang="ts">
  import type { LetterState } from '@arcade/cipher';

  import Tile from './Tile.svelte';

  interface Row {
    letters: string[];
    states: LetterState[] | null;
    active: boolean;
  }

  interface Props {
    rows: Row[];
    /** Incremented on each rejected entry; restarts the shake. */
    shakeToken?: number;
    revealToken?: number;
    solved?: boolean;
  }

  let { rows, shakeToken = 0, revealToken = 0, solved = false }: Props = $props();
</script>

<div class="grid" class:solved>
  {#each rows as row, rowIndex (rowIndex)}
    {#key row.active && shakeToken > 0 ? `${rowIndex}-${shakeToken}` : rowIndex}
      <div class="row" class:shake={row.active && shakeToken > 0}>
        {#each row.letters as letter, i (i)}
          <Tile
            {letter}
            state={row.states?.[i] ?? null}
            index={i}
            revealToken={row.states === null ? 0 : revealToken}
          />
        {/each}
      </div>
    {/key}
  {/each}
</div>

<style>
  .grid {
    display: grid;
    gap: var(--space-2);
    width: min(100%, 22rem);
    margin-inline: auto;
  }

  .row {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--space-2);
  }

  .shake {
    animation: shake 420ms var(--ease);
  }

  .grid.solved {
    animation: pulse 700ms var(--ease);
  }

  @keyframes shake {
    10%,
    90% {
      transform: translateX(-3px);
    }
    20%,
    80% {
      transform: translateX(6px);
    }
    30%,
    50%,
    70% {
      transform: translateX(-9px);
    }
    40%,
    60% {
      transform: translateX(9px);
    }
  }

  @keyframes pulse {
    50% {
      transform: scale(1.03);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shake,
    .grid.solved {
      animation: none;
    }
  }
</style>
