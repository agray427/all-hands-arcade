<script lang="ts">
  import { ArcadeClient } from "$lib/arcade.svelte";

  const arcade = new ArcadeClient();
  let hostName = $state("");

  function create() {
    const name = hostName.trim();
    if (name) arcade.createRoom(name);
  }
</script>

<h1>Host</h1>

{#if arcade.lastError}
  <p class="error">{arcade.lastError}</p>
{/if}

{#if !arcade.room}
  <form onsubmit={(e) => { e.preventDefault(); create(); }}>
    <input placeholder="Your name" bind:value={hostName} />
    <button type="submit" disabled={!hostName.trim()}>Create session</button>
  </form>
{:else}
  <section class="code">
    <span class="label">Room code</span>
    <span class="value">{arcade.room.id}</span>
  </section>

  <section>
    <h2>Roster ({arcade.roster.length})</h2>
    <ul class="roster">
      {#each arcade.roster as p (p.id)}
        <li>
          <span class="dot" class:on={p.connected}></span>
          <span class="name">{p.name}</span>
          <span class="badge">{p.role}</span>
        </li>
      {/each}
    </ul>
  </section>

  <button class="ghost" onclick={() => arcade.leave()}>Leave</button>
{/if}

<style>
  form {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  input {
    flex: 1;
    min-width: 12rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid #2b3040;
    background: #12141c;
    color: inherit;
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
    margin-top: 1.5rem;
  }
  .code {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    margin: 1rem 0 2rem;
  }
  .code .label {
    color: #9aa1b1;
    font-size: 0.85rem;
  }
  .code .value {
    font-size: 3rem;
    font-weight: 800;
    letter-spacing: 0.25em;
  }
  .roster {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .roster li {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .dot {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: #4b5163;
  }
  .dot.on {
    background: #22c55e;
  }
  .name {
    flex: 1;
  }
  .badge {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9aa1b1;
    border: 1px solid #2b3040;
    border-radius: 999px;
    padding: 0.1rem 0.5rem;
  }
  .error {
    color: #f87171;
  }
</style>
