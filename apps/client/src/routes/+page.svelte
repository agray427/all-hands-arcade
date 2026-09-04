<script lang="ts">
  const games = [
    {
      name: 'Rock Paper Scissors Lizard Spock',
      tagline: 'Everyone throws at once. Score a point for every person you beat.',
      badge: 'New',
    },
  ];
</script>

<svelte:head><title>All Hands Arcade</title></svelte:head>

<main class="page">
  <header>
    <span class="tag">All Hands Arcade</span>
    <h1>Party games that scale to the whole company.</h1>
    <p class="muted">
      One screen to share, one phone per player. No installs, no accounts, no waiting your turn.
    </p>
  </header>

  <div class="actions">
    <a class="card host" href="/host">
      <h2>Host a game</h2>
      <p>Set it up, put the room code on the big screen, and press start.</p>
      <span class="cta">Open the host screen</span>
    </a>
    <a class="card join" href="/play">
      <h2>Join a game</h2>
      <p>Got a four-letter code? That is all you need.</p>
      <span class="cta">Enter a room code</span>
    </a>
  </div>

  <section class="panel catalogue">
    <h3>In the arcade</h3>
    <ul>
      {#each games as game (game.name)}
        <li>
          <div>
            <strong>{game.name}</strong>
            <p class="muted">{game.tagline}</p>
          </div>
          <span class="tag">{game.badge}</span>
        </li>
      {/each}
    </ul>
  </section>
</main>

<style>
  header {
    max-width: 720px;
    margin-bottom: 36px;
  }

  h1 {
    font-size: clamp(2rem, 6vw, 3.4rem);
    margin: 16px 0 12px;
  }

  .actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .card {
    display: block;
    text-decoration: none;
    color: inherit;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 28px;
    transition: border-color 0.15s ease, transform 0.15s ease;
  }

  .card:hover {
    border-color: var(--accent);
    transform: translateY(-2px);
  }

  .card.join:hover {
    border-color: var(--accent-2);
  }

  .card p {
    color: var(--muted);
  }

  .cta {
    font-weight: 700;
    color: var(--accent-2);
  }

  .catalogue h3 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin-bottom: 14px;
  }

  .catalogue ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .catalogue li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: var(--panel-2);
    border-radius: 10px;
    padding: 14px 16px;
  }

  .catalogue p {
    margin: 4px 0 0;
    font-size: 0.9rem;
  }
</style>
