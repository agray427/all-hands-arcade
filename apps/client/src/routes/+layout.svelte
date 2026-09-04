<script lang="ts">
  import '../app.css';

  let { children } = $props();
</script>

<svelte:head>
  <title>Cipher — All Hands Arcade</title>
  <meta name="description" content="A competitive 5x5 word game for large team events." />
  <meta name="theme-color" content="#0b0f1a" />
</svelte:head>

{@render children()}
