<script lang="ts">
  import { GESTURE_EMOJI, GESTURE_LABEL } from '@arcade/rpsls';
  import type { Gesture } from '@arcade/rpsls';

  let { tally }: { tally: Array<{ gesture: Gesture; count: number }> } = $props();

  const max = $derived(Math.max(1, ...tally.map((row) => row.count)));
</script>

<section class="tally">
  <h3>What the room threw</h3>
  <div class="rows">
    {#each tally as row (row.gesture)}
      <div class="row">
        <span class="label"><span class="emoji">{GESTURE_EMOJI[row.gesture]}</span> {GESTURE_LABEL[row.gesture]}</span>
        <div class="bar"><div class="fill" style="width: {(row.count / max) * 100}%"></div></div>
        <span class="count">{row.count}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  h3 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 0 0 12px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: grid;
    grid-template-columns: 9rem 1fr 2.5rem;
    align-items: center;
    gap: 12px;
  }

  .label {
    font-weight: 600;
    white-space: nowrap;
  }

  .emoji {
    font-size: 1.2rem;
  }

  .bar {
    background: var(--panel-2);
    border-radius: 999px;
    height: 14px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-2));
    border-radius: 999px;
    transition: width 0.4s ease;
  }

  .count {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
