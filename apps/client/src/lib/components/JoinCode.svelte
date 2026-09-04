<script lang="ts">
  interface Props {
    code: string;
    big?: boolean;
  }

  let { code, big = false }: Props = $props();
  let copied = $state(false);

  async function copy(): Promise<void> {
    const url = `${location.origin}/play/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {
      // Clipboard blocked (insecure context, permissions): the code is on
      // screen anyway, which is the primary way people join.
    }
  }
</script>

<div class="join" class:big>
  <span class="eyebrow">Join code</span>
  <strong class="code">{code}</strong>
  <button onclick={copy}>{copied ? 'Link copied' : 'Copy join link'}</button>
</div>

<style>
  .join {
    display: grid;
    gap: var(--space-2);
    justify-items: start;
  }

  .code {
    font-family: var(--font-mono);
    font-size: 2.6rem;
    letter-spacing: 0.3em;
    line-height: 1;
    color: var(--accent);
    text-shadow: 0 0 30px rgba(86, 209, 196, 0.35);
  }

  /* On a projector the code has to read from the back of the room. */
  .big .code {
    font-size: clamp(3rem, 11vw, 6rem);
  }

  button {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-pill);
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: 0.85rem;
    font-weight: 600;
  }

  button:hover {
    color: var(--text-1);
    border-color: var(--accent);
  }
</style>
