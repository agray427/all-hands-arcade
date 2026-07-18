export type FieldSpec = string;
export type PayloadFields = Record<string, FieldSpec>;

const PRIMITIVES = new Set(["string", "number", "boolean"]);

export function parseFieldSpec(spec: FieldSpec): { type: string; optional: boolean } {
  const optional = spec.endsWith("?");
  const type = optional ? spec.slice(0, -1) : spec;
  return { type, optional };
}

export function validatePayload(
  fields: PayloadFields,
  raw: unknown,
): { ok: true } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "payload is not an object" };
  }
  const payload = raw as Record<string, unknown>;
  for (const [field, spec] of Object.entries(fields)) {
    const { type, optional } = parseFieldSpec(spec);
    const value = payload[field];
    if (value === undefined) {
      if (optional) continue;
      return { ok: false, error: `${field} must be ${type}` };
    }
    if (PRIMITIVES.has(type)) {
      if (typeof value !== type) return { ok: false, error: `${field} must be ${type}` };
    } else if (type === "object") {
      if (typeof value !== "object" || value === null) {
        return { ok: false, error: `${field} must be object` };
      }
    }
  }
  return { ok: true };
}
