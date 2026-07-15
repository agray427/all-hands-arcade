import type {
  AnyGameDefinition,
  ConfigField,
  GameCatalog,
  GameConfig,
} from "./types.js";

export type ResolvedConfig =
  | { ok: true; variantId: string; config: GameConfig }
  | { ok: false; code: "NO_SUCH_VARIANT" | "INVALID_CONFIG"; error: string };

function checkField(name: string, field: ConfigField, value: unknown): string | null {
  if (typeof value !== field.type) return `${name} must be ${field.type}`;
  if (field.min !== undefined && typeof value === "number" && value < field.min) {
    return `${name} must be at least ${field.min}`;
  }
  if (field.options && !field.options.some((o) => o.value === value)) {
    return `${name} must be one of: ${field.options.map((o) => o.value).join(", ")}`;
  }
  return null;
}

export function resolveConfig(
  definition: AnyGameDefinition,
  variantId: string | undefined,
  raw: GameConfig | undefined,
): ResolvedConfig {
  const id = variantId ?? definition.defaultVariant;
  const variant = definition.variants[id];
  if (!variant) {
    return { ok: false, code: "NO_SUCH_VARIANT", error: `no variant "${id}" for ${definition.id}` };
  }

  const overrides = raw ?? {};
  for (const key of Object.keys(overrides)) {
    if (!variant.configFields[key]) {
      return { ok: false, code: "INVALID_CONFIG", error: `unknown config field: ${key}` };
    }
  }

  const config: GameConfig = {};
  for (const [name, field] of Object.entries(variant.configFields)) {
    const value = overrides[name] ?? field.default;
    if (value === undefined) continue;
    const error = checkField(name, field, value);
    if (error) return { ok: false, code: "INVALID_CONFIG", error };
    config[name] = value;
  }

  const refinement = variant.validateConfig?.(config);
  if (refinement) return { ok: false, code: "INVALID_CONFIG", error: refinement };

  return { ok: true, variantId: id, config };
}

export function toCatalog(definitions: AnyGameDefinition[]): GameCatalog {
  return definitions.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    minPlayers: d.minPlayers,
    defaultVariant: d.defaultVariant,
    variants: Object.entries(d.variants).map(([id, v]) => ({
      id,
      name: v.name,
      description: v.description,
      configFields: v.configFields,
      hostDriven: v.hostDriven ?? false,
    })),
  }));
}
