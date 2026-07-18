<script lang="ts">
  let { onsubmit }: { onsubmit: (strokes: [number, number][][]) => void } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let strokes: [number, number][][] = $state([]);
  let current: [number, number][] = [];
  let drawing = false;

  function ctx2d(): CanvasRenderingContext2D | null {
    return canvas?.getContext("2d") ?? null;
  }

  function repaint() {
    const ctx = ctx2d();
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e2e6f0";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of [...strokes, current]) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]![0], stroke[0]![1]);
      for (const [x, y] of stroke.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  function pointOf(e: PointerEvent): [number, number] {
    const rect = canvas!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 300;
    const y = ((e.clientY - rect.top) / rect.height) * 300;
    return [Math.round(Math.max(0, Math.min(300, x))), Math.round(Math.max(0, Math.min(300, y)))];
  }

  function down(e: PointerEvent) {
    drawing = true;
    current = [pointOf(e)];
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    repaint();
  }

  function move(e: PointerEvent) {
    if (!drawing) return;
    current.push(pointOf(e));
    repaint();
  }

  function up() {
    if (!drawing) return;
    drawing = false;
    if (current.length > 1) strokes = [...strokes, current];
    current = [];
    repaint();
  }

  function clear() {
    strokes = [];
    current = [];
    repaint();
  }
</script>

<div class="draw">
  <canvas
    bind:this={canvas}
    width="300"
    height="300"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
  ></canvas>
  <div class="controls">
    <button class="ghost" onclick={clear}>Clear</button>
    <button disabled={strokes.length === 0} onclick={() => onsubmit(strokes)}>
      Submit drawing
    </button>
  </div>
</div>

<style>
  .draw {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  canvas {
    width: 100%;
    max-width: 22rem;
    aspect-ratio: 1;
    border-radius: 10px;
    background: #12141c;
    border: 1px solid #2b3040;
    touch-action: none;
    cursor: crosshair;
  }
  .controls {
    display: flex;
    gap: 0.5rem;
  }
  button {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    border: none;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .ghost {
    background: transparent;
    border: 1px solid #2b3040;
    color: #9aa1b1;
  }
</style>
