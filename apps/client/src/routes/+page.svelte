<script lang="ts">
  import { goto } from '$app/navigation';
  import { GAME_NAME, MAX_GUESSES, WORD_LENGTH, allowedWordCount } from '@arcade/cipher';

  let code = $state('');

  function join(event: SubmitEvent): void {
    event.preventDefault();
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length >= 4) void goto(`/play/${clean}`);
  }
</script>

<main class="page landing">
  <header>
    <p class="eyebrow">All Hands Arcade</p>
    <h1>{GAME_NAME}</h1>
    <p class="tagline">
      {WORD_LENGTH} letters. {MAX_GUESSES} guesses. Three minutes. Everyone races the same word,
      and the clock is worth as much as the answer.
    </p>
  </header>

  <div class="cards">
    <section class="panel">
      <h2>Join a game</h2>
      <p class="muted">Your facilitator has a four-character code on screen.</p>
      <form onsubmit={join}>
        <input
          bind:value={code}
          placeholder="CODE"
          maxlength="6"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          aria-label="Join code"
        />
        <button class="primary" type="submit">Join</button>
      </form>
    </section>

    <section class="panel">
      <h2>Host a game</h2>
      <p class="muted">
        Pick the word each round, watch the room race it, and run the leaderboard from one screen.
      </p>
      <a class="primary block" href="/host">Set up a room</a>
    </section>
  </div>

  <section class="rules panel">
    <h2>How scoring works</h2>
    <div class="rule-grid">
      <div>
        <span class="eyebrow">Speed — up to 500</span>
        <p class="muted">
          500 inside 15 seconds, sliding down to 100 at the three-minute buzzer. Every second in
          between counts, so no two solves are worth quite the same.
        </p>
      </div>
      <div>
        <span class="eyebrow">Guesses — up to 500</span>
        <p class="muted">
          500 for a first-guess solve, then 400, 300, 200, 100. A correct answer is worth at least
          200 points, even on the last guess as the clock runs out.
        </p>
      </div>
      <div>
        <span class="eyebrow">Every word is a real word</span>
        <p class="muted">
          Guesses and secret words both come from the same list of
          {allowedWordCount().toLocaleString()} words. Anything else is refused before it costs you
          a guess.
        </p>
      </div>
    </div>
  </section>
</main>

<style>
  .landing {
    display: grid;
    gap: var(--space-6);
    padding-top: var(--space-7);
  }

  header {
    text-align: center;
    display: grid;
    gap: var(--space-3);
    justify-items: center;
  }

  h1 {
    font-size: clamp(3rem, 12vw, 5.5rem);
    background: linear-gradient(120deg, var(--text-1), var(--accent));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .tagline {
    max-width: 34rem;
    margin: 0;
    color: var(--text-2);
    font-size: 1.05rem;
  }

  .cards {
    display: grid;
    gap: var(--space-4);
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
  }

  h2 {
    font-size: 1.25rem;
    margin-bottom: var(--space-2);
  }

  .panel p {
    margin: 0 0 var(--space-4);
    font-size: 0.92rem;
  }

  form {
    display: flex;
    gap: var(--space-2);
  }

  input {
    flex: 1;
    min-width: 0;
    padding: var(--space-3);
    background: var(--surface-2);
    border: 2px solid var(--border-2);
    border-radius: var(--radius-2);
    font-family: var(--font-mono);
    font-size: 1.2rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
  }

  .primary {
    display: inline-block;
    padding: var(--space-3) var(--space-5);
    border: none;
    border-radius: var(--radius-2);
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 800;
    text-decoration: none;
    text-align: center;
  }

  .primary:hover {
    background: var(--accent-strong);
  }

  .block {
    display: block;
  }

  .rule-grid {
    display: grid;
    gap: var(--space-5);
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  }

  .rule-grid p {
    margin: var(--space-2) 0 0;
    font-size: 0.88rem;
  }
</style>
