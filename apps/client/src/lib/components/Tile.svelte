<script lang="ts">
  import type { LetterState } from '@arcade/cipher';

  interface Props {
    letter?: string;
    state?: LetterState | null;
    index?: number;
    /** Bumped when a new row is revealed, so the flip replays. */
    revealToken?: number;
    small?: boolean;
  }

  let { letter = '', state = null, index = 0, revealToken = 0, small = false }: Props = $props();

  const label = $derived(
    state === null
      ? letter === ''
        ? 'empty'
        : `${letter}, not submitted`
      : `${letter}, ${state === 'correct' ? 'correct place' : state === 'present' ? 'wrong place' : 'not in the word'}`,
  );
</script>

<div
  class="tile"
  class:small
  class:filled={letter !== '' && state === null}
  class:revealed={state !== null}
  data-state={state}
  style="--flip-delay: {index * 90}ms"
  aria-label={small ? undefined : label}
  role={small ? 'presentation' : 'img'}
>
  {#key revealToken}
    <span class="face">{letter.toUpperCase()}</span>
  {/key}
</div>

<style>
  .tile {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    width: 100%;
    border: 2px solid var(--border-1);
    border-radius: var(--radius-2);
    background: var(--tile-empty);
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 7vw, 2.1rem);
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--text-1);
    transition:
      border-color var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }

  .tile.filled {
    border-color: var(--tile-filled-border);
    /* A small pop confirms the keypress landed. */
    animation: pop var(--dur-fast) var(--ease);
  }

  .tile.revealed {
    border-color: transparent;
    color: #fff;
    animation: flip var(--dur-flip) var(--ease) backwards;
    animation-delay: var(--flip-delay);
  }

  .tile[data-state='correct'] {
    background: var(--tile-correct);
  }
  .tile[data-state='present'] {
    background: var(--tile-present);
  }
  .tile[data-state='absent'] {
    background: var(--tile-absent);
  }

  .tile.small {
    border-width: 1px;
    border-radius: 3px;
    font-size: 0;
    animation: none;
  }

  @keyframes pop {
    from {
      transform: scale(0.9);
    }
    to {
      transform: scale(1);
    }
  }

  @keyframes flip {
    0% {
      transform: rotateX(0deg);
      background: var(--tile-empty);
      border-color: var(--tile-filled-border);
      color: var(--text-1);
    }
    45% {
      transform: rotateX(90deg);
      background: var(--tile-empty);
      border-color: var(--tile-filled-border);
      color: var(--text-1);
    }
    55% {
      transform: rotateX(90deg);
    }
    100% {
      transform: rotateX(0deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tile.filled,
    .tile.revealed {
      animation: none;
    }
  }
</style>
