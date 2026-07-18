<script lang="ts">
  let { deadline, timeMs }: { deadline: number; timeMs: number } = $props();

  let now = $state(Date.now());

  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 100);
    return () => clearInterval(timer);
  });

  const remaining = $derived(Math.max(0, deadline - now));
  const fraction = $derived(timeMs > 0 ? Math.min(1, remaining / timeMs) : 0);
</script>

<div class="countdown" role="timer" aria-label="time remaining">
  <div class="bar" class:urgent={remaining < 3000} style={`width: ${fraction * 100}%`}></div>
  <span class="seconds">{Math.ceil(remaining / 1000)}s</span>
</div>

<style>
  .countdown {
    position: relative;
    height: 1.4rem;
    border-radius: 999px;
    background: #12141c;
    border: 1px solid #2b3040;
    overflow: hidden;
  }
  .bar {
    height: 100%;
    background: #3b82f6;
    transition: width 100ms linear;
  }
  .bar.urgent {
    background: #f87171;
  }
  .seconds {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 700;
    color: #e5e8ef;
  }
</style>
