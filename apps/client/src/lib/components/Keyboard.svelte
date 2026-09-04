<script lang="ts">
  import type { LetterState } from '@arcade/cipher';

  interface Props {
    states: Map<string, LetterState>;
    disabled?: boolean;
    onKey: (letter: string) => void;
    onEnter: () => void;
    onBackspace: () => void;
  }

  let { states, disabled = false, onKey, onEnter, onBackspace }: Props = $props();

  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
</script>

<div class="keyboard" role="group" aria-label="On-screen keyboard">
  {#each ROWS as row, rowIndex (rowIndex)}
    <div class="krow">
      {#if rowIndex === 2}
        <button class="key wide" {disabled} onclick={onEnter} aria-label="Submit guess">
          Enter
        </button>
      {/if}
      {#each row as letter (letter)}
        <button
          class="key"
          data-state={states.get(letter) ?? null}
          {disabled}
          onclick={() => onKey(letter)}
          aria-label={letter}
        >
          {letter.toUpperCase()}
        </button>
      {/each}
      {#if rowIndex === 2}
        <button class="key wide" {disabled} onclick={onBackspace} aria-label="Delete letter">
          ⌫
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .keyboard {
    display: grid;
    gap: var(--space-2);
    width: min(100%, 34rem);
    margin-inline: auto;
  }

  .krow {
    display: flex;
    gap: 5px;
    justify-content: center;
  }

  .key {
    flex: 1 1 0;
    min-width: 0;
    /* Comfortably above the 44px touch target minimum on a phone. */
    height: 3.4rem;
    border: 1px solid var(--border-2);
    border-radius: var(--radius-1);
    background: var(--surface-2);
    color: var(--text-1);
    font-weight: 700;
    font-size: 0.95rem;
    transition:
      background var(--dur-fast) var(--ease),
      transform var(--dur-fast) var(--ease);
  }

  .key.wide {
    flex: 1.6 1 0;
    font-size: 0.8rem;
  }

  .key:hover:not(:disabled) {
    background: var(--surface-3);
  }

  .key:active:not(:disabled) {
    transform: translateY(1px);
  }

  .key:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .key[data-state='correct'] {
    background: var(--tile-correct);
    border-color: transparent;
    color: #fff;
  }
  .key[data-state='present'] {
    background: var(--tile-present);
    border-color: transparent;
    color: #fff;
  }
  .key[data-state='absent'] {
    background: var(--surface-1);
    color: var(--text-3);
    border-color: var(--border-1);
  }
</style>
