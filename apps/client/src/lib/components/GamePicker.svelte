<script lang="ts">
  import type { ConfigField, GameCatalog, GameCatalogEntry, GameCatalogVariant, GameConfig } from "@arcade/core";

  let {
    catalog,
    onstart,
  }: {
    catalog: GameCatalog;
    onstart: (gameId: string, variantId: string, config: GameConfig) => void;
  } = $props();

  let selectedGameId = $state<string | null>(null);
  let selectedVariantId = $state<string | null>(null);
  let inputs = $state<Record<string, string>>({});

  const game = $derived<GameCatalogEntry | null>(
    catalog.find((g) => g.id === selectedGameId) ?? null,
  );
  const variant = $derived<GameCatalogVariant | null>(
    game?.variants.find((v) => v.id === selectedVariantId) ?? null,
  );

  function pickGame(entry: GameCatalogEntry) {
    selectedGameId = entry.id;
    selectedVariantId = entry.variants.length === 1 ? entry.variants[0].id : null;
    inputs = {};
  }

  function pickVariant(id: string) {
    selectedVariantId = id;
    inputs = {};
  }

  function fieldValue(name: string, field: ConfigField): string {
    return inputs[name] ?? String(field.default ?? "");
  }

  function start() {
    if (!game || !variant) return;
    const config: GameConfig = {};
    for (const [name, field] of Object.entries(variant.configFields)) {
      const raw = String(inputs[name] ?? "").trim();
      if (raw === "") {
        if (field.options && field.default !== undefined) config[name] = field.default;
        continue;
      }
      config[name] = field.type === "number" ? Number(raw) : raw;
    }
    onstart(game.id, variant.id, config);
  }
</script>

<section class="picker">
  <h2>Pick a game</h2>
  <div class="cards">
    {#each catalog as entry (entry.id)}
      <button
        class="card"
        class:active={entry.id === selectedGameId}
        onclick={() => pickGame(entry)}
      >
        <span class="title">{entry.name}</span>
        <span class="hint">{entry.description}</span>
      </button>
    {/each}
  </div>

  {#if game && game.variants.length > 1}
    <h2>Variant</h2>
    <div class="cards">
      {#each game.variants as v (v.id)}
        <button
          class="card"
          class:active={v.id === selectedVariantId}
          onclick={() => pickVariant(v.id)}
        >
          <span class="title">{v.name}</span>
          <span class="hint">{v.description}</span>
        </button>
      {/each}
    </div>
  {/if}

  {#if variant}
    <h2>Settings</h2>
    <div class="fields">
      {#each Object.entries(variant.configFields) as [name, field] (name)}
        {#if field.options}
          <label class="field">
            <span>{field.label}</span>
            <select bind:value={inputs[name]}>
              {#each field.options as option (option.value)}
                <option value={option.value} selected={option.value === fieldValue(name, field)}>
                  {option.label}{option.description ? ` — ${option.description}` : ""}
                </option>
              {/each}
            </select>
          </label>
        {:else if field.type === "number"}
          <label class="field">
            <span>{field.label}</span>
            <input
              type="number"
              min={field.min}
              placeholder={field.default !== undefined ? String(field.default) : "auto"}
              bind:value={inputs[name]}
            />
          </label>
        {/if}
      {/each}
    </div>
    <button class="start" onclick={start}>Start {game?.name}</button>
  {/if}
</section>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.4rem;
    padding: 1rem;
    border-radius: 12px;
    background: #171a23;
    border: 1px solid #262a36;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .card:hover {
    border-color: #3b82f6;
  }
  .card.active {
    border-color: #3b82f6;
    background: #101726;
  }
  .title {
    font-weight: 700;
  }
  .hint {
    color: #9aa1b1;
    font-size: 0.85rem;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: #9aa1b1;
  }
  input,
  select {
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    border: 1px solid #2b3040;
    background: #12141c;
    color: #e5e8ef;
  }
  .start {
    align-self: flex-start;
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    border: none;
    background: #3b82f6;
    color: white;
    font-weight: 600;
    cursor: pointer;
  }
</style>
