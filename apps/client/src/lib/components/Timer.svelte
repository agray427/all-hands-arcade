<script lang="ts">
  let {
    endsAt,
    total = 15,
    size = 140,
  }: { endsAt: number; total?: number; size?: number } = $props();

  let now = $state(Date.now());

  $effect(() => {
    const id = setInterval(() => (now = Date.now()), 100);
    return () => clearInterval(id);
  });

  const remaining = $derived(Math.max(0, endsAt - now));
  const seconds = $derived(Math.ceil(remaining / 1000));
  const fraction = $derived(total > 0 ? Math.min(1, remaining / (total * 1000)) : 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const urgent = $derived(seconds <= 5);
</script>

<div class="timer" style="width: {size}px; height: {size}px" aria-live="off">
  <svg viewBox="0 0 120 120" role="img" aria-label="{seconds} seconds left">
    <circle cx="60" cy="60" r={radius} class="track" />
    <circle
      cx="60"
      cy="60"
      r={radius}
      class="progress"
      class:urgent
      stroke-dasharray={circumference}
      stroke-dashoffset={circumference * (1 - fraction)}
    />
  </svg>
  <span class="count" class:urgent>{seconds}</span>
</div>

<style>
  .timer {
    position: relative;
    display: grid;
    place-items: center;
  }

  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .track {
    fill: none;
    stroke: var(--line);
    stroke-width: 8;
  }

  .progress {
    fill: none;
    stroke: var(--accent-2);
    stroke-width: 8;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.1s linear;
  }

  .progress.urgent {
    stroke: var(--warn);
  }

  .count {
    position: absolute;
    font-size: 2.4rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .count.urgent {
    color: var(--warn);
  }
</style>
