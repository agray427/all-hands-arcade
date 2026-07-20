<script lang="ts"></script>

<h1>Welcome</h1>
<p>Start a hosted session on the big screen, or join one from your phone.</p>

<div class="cards">
  <a class="card" href="/host">
    <span class="role">Host</span>
    <span class="hint">Create a session and show the room ID.</span>
  </a>
  <a class="card" href="/play">
    <span class="role">Join</span>
    <span class="hint">Enter a room ID to join a session.</span>
  </a>
</div>

<style>
  .cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.5rem;
    border-radius: 12px;
    background: #171a23;
    border: 1px solid #262a36;
    text-decoration: none;
    color: inherit;
  }
  .card:hover {
    border-color: #3b82f6;
  }
  .role {
    font-size: 1.25rem;
    font-weight: 700;
  }
  .hint {
    color: #9aa1b1;
    font-size: 0.9rem;
  }
  @media (max-width: 480px) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
