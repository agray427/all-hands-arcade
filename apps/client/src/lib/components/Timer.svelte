<script lang="ts">
  import { ROUND_DURATION_MS } from '@arcade/cipher';

  interface Props {
    msRemaining: number;
    running?: boolean;
  }

  let { msRemaining, running = true }: Props = $props();

  const seconds = $derived(Math.ceil(msRemaining / 1000));
  const fraction = $derived(Math.max(0, Math.min(1, msRemaining / ROUND_DURATION_MS)));
  const tone = $derived(seconds <= 10 ? 'danger' : seconds <= 30 ? 'warn' : 'calm');
  const label = $derived(
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
  );

  const R = 26;
  const CIRC = 2 * Math.PI * R;
</script>

<div class="timer" data-tone={tone} class:running>
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <circle class="track" cx="32" cy="32" r={R} />
    <circle
      class="progress"
      cx="32"
      cy="32"
      r={R}
      stroke-dasharray={CIRC}
      stroke-dashoffset={CIRC * (1 - fraction)}
    />
  </svg>
  <span class="value">{label}</span>
  <span class="sr-only" role="timer" aria-live="off">{seconds} seconds remaining</span>
</div>

<style>
  .timer {
    position: relative;
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
  }

  svg {
    position: absolute;
    inset: 0;
    transform: rotate(-90deg);
  }

  .track {
    fill: none;
    stroke: var(--surface-3);
    stroke-width: 5;
  }

  .progress {
    fill: none;
    stroke: var(--accent);
    stroke-width: 5;
    stroke-linecap: round;
    transition: stroke-dashoffset 240ms linear, stroke var(--dur-slow) var(--ease);
  }

  .value {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: 0.95rem;
    font-weight: 700;
  }

  [data-tone='warn'] .progress {
    stroke: var(--warn);
  }
  [data-tone='danger'] .progress {
    stroke: var(--danger);
  }
  [data-tone='danger'].running .value {
    color: var(--danger);
    animation: blink 1s steps(2, start) infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.45;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-tone='danger'].running .value {
      animation: none;
    }
  }
</style>
