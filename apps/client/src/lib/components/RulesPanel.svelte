<script lang="ts">
  let { rules, compact = false }: { rules: string[]; compact?: boolean } = $props();
</script>

<section class="rules" class:compact>
  <h3>Who beats who</h3>
  <ul>
    {#each rules as rule (rule)}
      <li>{rule}</li>
    {/each}
  </ul>
</section>

<style>
  h3 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    margin: 0 0 12px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 8px;
  }

  li {
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 0.95rem;
  }

  .compact li {
    font-size: 0.85rem;
    padding: 8px 10px;
  }
</style>
