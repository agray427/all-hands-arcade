<script lang="ts">
  import { goto } from '$app/navigation';

  let code = $state('');

  function go(event: SubmitEvent): void {
    event.preventDefault();
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length >= 4) void goto(`/play/${clean}`);
  }
</script>

<main class="page">
  <a class="back" href="/">← Back</a>
  <h1>Join a game</h1>
  <form class="panel" onsubmit={go}>
    <label>
      <span class="eyebrow">Join code</span>
      <input bind:value={code} maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" required />
    </label>
    <button class="primary" type="submit">Continue</button>
  </form>
</main>

<style>
  .page {
    max-width: 26rem;
    display: grid;
    gap: var(--space-4);
  }

  .back {
    color: var(--text-3);
    text-decoration: none;
    font-size: 0.9rem;
  }

  form {
    display: grid;
    gap: var(--space-4);
  }

  label {
    display: grid;
    gap: var(--space-2);
  }

  input {
    padding: var(--space-3);
    background: var(--surface-2);
    border: 2px solid var(--border-2);
    border-radius: var(--radius-2);
    font-family: var(--font-mono);
    font-size: 1.3rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    text-align: center;
  }

  .primary {
    padding: var(--space-4);
    border: none;
    border-radius: var(--radius-2);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
  }
</style>
