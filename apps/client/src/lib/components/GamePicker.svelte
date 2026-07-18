<script lang="ts">
  import type { ConfigField, GameCatalog, GameCatalogEntry, GameCatalogVariant, GameConfig } from "@arcade/core";
  import {
    deleteSetup,
    exportSetups,
    importSetups,
    listSetups,
    saveSetup,
    type SavedSetup,
  } from "../setups.js";

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
  let setups = $state<SavedSetup[]>([]);
  let setupName = $state("");
  let exportIds = $state<string[]>([]);
  let importText = $state("");
  let importReport = $state<string[]>([]);

  $effect(() => {
    setups = listSetups();
  });

  const game = $derived<GameCatalogEntry | null>(
    catalog.find((g) => g.id === selectedGameId) ?? null,
  );
  const variant = $derived<GameCatalogVariant | null>(
    game?.variants.find((v) => v.id === selectedVariantId) ?? null,
  );
  const savedHere = $derived(
    setups.filter((s) => s.gameId === game?.id && s.variantId === variant?.id),
  );

  function pickGame(entry: GameCatalogEntry) {
    selectedGameId = entry.id;
    selectedVariantId = entry.variants.length === 1 ? entry.variants[0].id : null;
    inputs = {};
    exportIds = [];
  }

  function pickVariant(id: string) {
    selectedVariantId = id;
    inputs = {};
    exportIds = [];
  }

  function fieldValue(name: string, field: ConfigField): string {
    return inputs[name] ?? String(field.default ?? "");
  }

  function visible(field: ConfigField): boolean {
    if (!field.when || !variant) return true;
    const controlling = variant.configFields[field.when.field];
    const current = inputs[field.when.field] ?? String(controlling?.default ?? "");
    return current === String(field.when.equals);
  }

  function currentConfig(): GameConfig {
    const config: GameConfig = {};
    if (!variant) return config;
    for (const [name, field] of Object.entries(variant.configFields)) {
      if (!visible(field)) continue;
      const raw = String(inputs[name] ?? "").trim();
      if (raw === "") {
        if (field.options && field.default !== undefined) config[name] = field.default;
        continue;
      }
      config[name] = field.type === "number" ? Number(raw) : raw;
    }
    return config;
  }

  function start() {
    if (!game || !variant) return;
    onstart(game.id, variant.id, currentConfig());
  }

  function saveCurrent() {
    if (!game || !variant || !setupName.trim()) return;
    saveSetup({
      gameId: game.id,
      variantId: variant.id,
      name: setupName.trim(),
      config: currentConfig(),
    });
    setupName = "";
    setups = listSetups();
  }

  function loadSetup(setup: SavedSetup) {
    inputs = Object.fromEntries(
      Object.entries(setup.config).map(([key, value]) => [key, String(value)]),
    );
  }

  function removeSetup(id: string) {
    deleteSetup(id);
    exportIds = exportIds.filter((x) => x !== id);
    setups = listSetups();
  }

  function exportSelected() {
    if (exportIds.length === 0) return;
    const blob = new Blob([exportSetups(exportIds)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "arcade-setups.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function placeOf(setup: SavedSetup): string {
    const g = catalog.find((entry) => entry.id === setup.gameId);
    const v = g?.variants.find((entry) => entry.id === setup.variantId);
    return `${g?.name ?? setup.gameId} / ${v?.name ?? setup.variantId}`;
  }

  function runImport(source: string) {
    const outcome = importSetups(source, catalog);
    if (outcome.error) {
      importReport = [`Import failed: ${outcome.error}.`];
      return;
    }
    const lines: string[] = [];
    if (outcome.imported.length === 0 && outcome.skipped.length === 0) {
      lines.push("No setups found in that JSON.");
    }
    for (const setup of outcome.imported) {
      lines.push(`Imported "${setup.name}" → ${placeOf(setup)}.`);
    }
    for (const skip of outcome.skipped) {
      lines.push(`Skipped ${skip.label}: ${skip.reason}.`);
    }
    importReport = lines;
    setups = listSetups();
    if (outcome.imported.length > 0) importText = "";
  }

  function importFromFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text) => {
      runImport(text);
      input.value = "";
    });
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
        <span class="title">
          {entry.name}
          {#if entry.stability}
            <span class="stability">{entry.stability}</span>
          {/if}
        </span>
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

  {#if game?.stability}
    <p class="stability-note">
      This game is an <strong>{game.stability}</strong> build — expect rough edges and the
      occasional bug.
    </p>
  {/if}

  {#if variant}
    <h2>Settings</h2>
    <div class="fields">
      {#each Object.entries(variant.configFields) as [name, field] (name)}
        {#if visible(field)}
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
          {:else if field.multiline}
            <label class="field wide">
              <span>{field.label}</span>
              <textarea rows="6" bind:value={inputs[name]}></textarea>
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
        {/if}
      {/each}
    </div>
    <button class="start" onclick={start}>Start {game?.name}</button>

    <h2>Saved setups</h2>
    {#if savedHere.length > 0}
      <ul class="setups">
        {#each savedHere as setup (setup.id)}
          <li>
            <input type="checkbox" bind:group={exportIds} value={setup.id} />
            <button class="load" onclick={() => loadSetup(setup)}>{setup.name}</button>
            <button class="remove" aria-label="Delete {setup.name}" onclick={() => removeSetup(setup.id)}>✕</button>
          </li>
        {/each}
      </ul>
      <button class="ghost" disabled={exportIds.length === 0} onclick={exportSelected}>
        Export selected ({exportIds.length})
      </button>
    {:else}
      <p class="hint">Nothing saved for this variant yet.</p>
    {/if}
    <div class="saveline">
      <input placeholder="Setup name" bind:value={setupName} />
      <button class="ghost" disabled={!setupName.trim()} onclick={saveCurrent}>Save setup</button>
    </div>
  {/if}

  <h2>Import setups</h2>
  <div class="importer">
    <textarea
      rows="4"
      placeholder="Paste an exported setups JSON"
      bind:value={importText}
    ></textarea>
    <div class="importline">
      <button class="ghost" disabled={!importText.trim()} onclick={() => runImport(importText)}>
        Import
      </button>
      <label class="ghost file">
        Import from file
        <input type="file" accept="application/json,.json" onchange={importFromFile} />
      </label>
    </div>
    {#if importReport.length > 0}
      <ul class="report">
        {#each importReport as line, i (i)}
          <li>{line}</li>
        {/each}
      </ul>
    {/if}
  </div>
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
  .stability {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #fbbf24;
    border: 1px solid #4d4320;
    background: #221e0e;
    border-radius: 999px;
    padding: 0.1rem 0.45rem;
    margin-left: 0.4rem;
    vertical-align: middle;
  }
  .stability-note {
    color: #fbbf24;
    border: 1px solid #4d4320;
    background: #221e0e;
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    margin: 0;
    font-size: 0.9rem;
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
  select,
  textarea {
    padding: 0.55rem 0.7rem;
    border-radius: 8px;
    border: 1px solid #2b3040;
    background: #12141c;
    color: #e5e8ef;
  }
  textarea {
    font-family: monospace;
    font-size: 0.85rem;
    resize: vertical;
  }
  .field.wide {
    grid-column: 1 / -1;
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
  .setups {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-width: 24rem;
  }
  .setups li {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.6rem;
    border-radius: 8px;
    background: #171a23;
    border: 1px solid #262a36;
  }
  .setups input[type="checkbox"] {
    width: auto;
  }
  .load {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    color: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    padding: 0.2rem 0;
  }
  .load:hover {
    color: #93c5fd;
  }
  .remove {
    background: none;
    border: none;
    color: #9aa1b1;
    cursor: pointer;
  }
  .remove:hover {
    color: #f87171;
  }
  .ghost {
    align-self: flex-start;
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    background: transparent;
    border: 1px solid #2b3040;
    color: #9aa1b1;
    cursor: pointer;
  }
  .ghost:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .saveline,
  .importline {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }
  .saveline input {
    max-width: 14rem;
  }
  .importer {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    max-width: 32rem;
  }
  .file {
    position: relative;
    overflow: hidden;
  }
  .file input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .report {
    list-style: none;
    padding: 0.5rem 0.75rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    color: #93c5fd;
    border: 1px solid #1e3a5f;
    background: #0e1a2b;
    border-radius: 8px;
  }
</style>
