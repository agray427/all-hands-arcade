<script lang="ts">
  let { children } = $props();
</script>

<div class="shell">
  <header>
    <a class="brand" href="/">All Hands Arcade</a>
  </header>
  <main>
    {@render children()}
  </main>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #0f1117;
    color: #e6e8ee;
    font-family: system-ui, sans-serif;
  }
  .shell {
    max-width: 720px;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
  header {
    margin-bottom: 2rem;
  }
  .brand {
    color: #e6e8ee;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.1rem;
    letter-spacing: 0.02em;
  }
</style>
