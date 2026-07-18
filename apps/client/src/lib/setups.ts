import type { ConfigField, GameCatalog, GameConfig } from "@arcade/core";

export interface SavedSetup {
  id: string;
  gameId: string;
  variantId: string;
  name: string;
  config: GameConfig;
  savedAt: number;
}

export interface PortableSetup {
  gameId: string;
  variantId: string;
  name: string;
  config: GameConfig;
}

export interface SetupsFile {
  kind: "arcade-setups";
  version: 1;
  setups: PortableSetup[];
}

export interface ImportOutcome {
  imported: SavedSetup[];
  skipped: Array<{ label: string; reason: string }>;
  error?: string;
}

const SETUPS_KEY = "arcade:setups";

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function listSetups(): SavedSetup[] {
  const raw = storage()?.getItem(SETUPS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedSetup[]) : [];
  } catch {
    return [];
  }
}

function write(setups: SavedSetup[]): void {
  storage()?.setItem(SETUPS_KEY, JSON.stringify(setups));
}

export function saveSetup(setup: PortableSetup): SavedSetup {
  const setups = listSetups();
  const existing = setups.find(
    (s) =>
      s.gameId === setup.gameId && s.variantId === setup.variantId && s.name === setup.name,
  );
  const saved: SavedSetup = {
    id: existing?.id ?? `s_${Math.random().toString(36).slice(2, 10)}`,
    ...setup,
    savedAt: Date.now(),
  };
  write([...setups.filter((s) => s.id !== saved.id), saved]);
  return saved;
}

export function deleteSetup(id: string): void {
  write(listSetups().filter((s) => s.id !== id));
}

export function exportSetups(ids: string[]): string {
  const selected = listSetups().filter((s) => ids.includes(s.id));
  const file: SetupsFile = {
    kind: "arcade-setups",
    version: 1,
    setups: selected.map(({ gameId, variantId, name, config }) => ({
      gameId,
      variantId,
      name,
      config,
    })),
  };
  return JSON.stringify(file, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractEntries(parsed: unknown): { entries: unknown[] } | { error: string } {
  if (Array.isArray(parsed)) return { entries: parsed };
  if (!isRecord(parsed)) return { error: "expected a setups object or an array of setups" };
  if (parsed.kind !== undefined || parsed.setups !== undefined) {
    if (parsed.kind !== "arcade-setups") {
      return { error: `unrecognized file kind: ${JSON.stringify(parsed.kind)}` };
    }
    if (parsed.version !== 1) {
      return { error: `unsupported setups version: ${JSON.stringify(parsed.version)}` };
    }
    if (!Array.isArray(parsed.setups)) return { error: "setups must be an array" };
    return { entries: parsed.setups };
  }
  return { entries: [parsed] };
}

function matchesType(field: ConfigField, value: unknown): boolean {
  switch (field.type) {
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "boolean":
      return typeof value === "boolean";
  }
}

function validateEntry(
  entry: unknown,
  index: number,
  catalog: GameCatalog,
): { setup: PortableSetup } | { label: string; reason: string } {
  const fallback = `entry ${index + 1}`;
  if (!isRecord(entry)) return { label: fallback, reason: "not an object" };
  const label = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : fallback;
  if (typeof entry.name !== "string" || !entry.name.trim()) {
    return { label, reason: "missing a name" };
  }
  if (typeof entry.gameId !== "string") return { label, reason: "missing a gameId" };
  const game = catalog.find((g) => g.id === entry.gameId);
  if (!game) return { label, reason: `"${entry.gameId}" is not an installed game` };
  if (typeof entry.variantId !== "string") return { label, reason: "missing a variantId" };
  const variant = game.variants.find((v) => v.id === entry.variantId);
  if (!variant) {
    return { label, reason: `${game.name} has no "${entry.variantId}" variant` };
  }
  if (entry.config !== undefined && !isRecord(entry.config)) {
    return { label, reason: "config must be an object" };
  }

  const config: GameConfig = {};
  for (const [key, value] of Object.entries(entry.config ?? {})) {
    const field = variant.configFields[key];
    if (!field) continue;
    if (!matchesType(field, value)) {
      return { label, reason: `${key} must be a ${field.type}` };
    }
    if (field.options && !field.options.some((o) => o.value === value)) {
      return {
        label,
        reason: `${key} must be one of: ${field.options.map((o) => o.value).join(", ")}`,
      };
    }
    config[key] = value;
  }

  return {
    setup: {
      gameId: entry.gameId,
      variantId: entry.variantId,
      name: entry.name.trim(),
      config,
    },
  };
}

export function importSetups(source: string, catalog: GameCatalog): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return { imported: [], skipped: [], error: "not valid JSON" };
  }

  const extracted = extractEntries(parsed);
  if ("error" in extracted) return { imported: [], skipped: [], error: extracted.error };

  const imported: SavedSetup[] = [];
  const skipped: ImportOutcome["skipped"] = [];
  for (const [index, entry] of extracted.entries.entries()) {
    const result = validateEntry(entry, index, catalog);
    if ("setup" in result) {
      imported.push(saveSetup(result.setup));
    } else {
      skipped.push(result);
    }
  }
  return { imported, skipped };
}
