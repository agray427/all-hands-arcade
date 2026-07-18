<script lang="ts">
  let { strokes, small = false }: { strokes: [number, number][][]; small?: boolean } = $props();
</script>

<svg viewBox="0 0 300 300" class:small role="img" aria-label="drawing">
  {#if strokes.length === 0}
    <text x="150" y="150" text-anchor="middle" fill="#4b5163">(blank)</text>
  {/if}
  {#each strokes as stroke, i (i)}
    <polyline
      points={stroke.map(([x, y]) => `${x},${y}`).join(" ")}
      fill="none"
      stroke="#e2e6f0"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  {/each}
</svg>

<style>
  svg {
    width: 100%;
    max-width: 22rem;
    aspect-ratio: 1;
    border-radius: 10px;
    background: #12141c;
    border: 1px solid #2b3040;
  }
  svg.small {
    max-width: 10rem;
  }
</style>
