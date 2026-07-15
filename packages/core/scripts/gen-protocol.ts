import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { manifest } from "../src/protocol/messages.manifest.ts";

type FieldSpec = string;
type MessageFields = Record<string, FieldSpec>;

const PRIMITIVES = new Set(["string", "number", "boolean"]);

const REF_IMPORTS: Record<string, string> = {
  RoomView: "../models/index.js",
  Participant: "../models/index.js",
  EngineErrorCode: "./envelope.js",
  GameCatalog: "../game/types.js",
  GameResults: "../game/types.js",
  GameView: "../game/types.js",
};

function pascal(name: string): string {
  return name
    .split(/[:_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function camel(name: string): string {
  const p = pascal(name);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function payloadTypeName(messageType: string): string {
  return `${pascal(messageType)}Payload`;
}

function tsType(spec: FieldSpec): {
  type: string;
  optional: boolean;
  ref: string | null;
  check: string | null;
} {
  const optional = spec.endsWith("?");
  const base = optional ? spec.slice(0, -1) : spec;
  if (PRIMITIVES.has(base)) {
    return { type: base, optional, ref: null, check: base };
  }
  if (base === "object") {
    return { type: "Record<string, unknown>", optional, ref: null, check: "object" };
  }
  return { type: base, optional, ref: base, check: null };
}

function renderPayloadInterface(messageType: string, fields: MessageFields): string {
  const entries = Object.entries(fields);
  if (entries.length === 0) {
    return `export type ${payloadTypeName(messageType)} = Record<string, never>;`;
  }
  const lines = entries.map(([field, spec]) => {
    const { type, optional } = tsType(spec);
    return `  ${field}${optional ? "?" : ""}: ${type};`;
  });
  return `export interface ${payloadTypeName(messageType)} {\n${lines.join("\n")}\n}`;
}

function renderClientBuilder(messageType: string, fields: MessageFields): string {
  const name = camel(messageType);
  const pType = payloadTypeName(messageType);
  const hasFields = Object.keys(fields).length > 0;
  const param = hasFields ? `payload: ${pType}` : `payload: ${pType} = {}`;
  return `export const ${name} = (${param}): BaseMessage<${pType}> & { type: "${messageType}" } =>\n  envelope("${messageType}", payload) as BaseMessage<${pType}> & { type: "${messageType}" };`;
}

function renderServerBuilder(messageType: string): string {
  const name = camel(messageType);
  const pType = payloadTypeName(messageType);
  const cast = `ServerBroadcastEnvelope<${pType}> & { type: "${messageType}" }`;
  return `export const ${name} = (\n  payload: ${pType},\n  target: TargetAudience,\n  replyTo?: string,\n): ${cast} =>\n  ({ ...envelope("${messageType}", payload), target, ...(replyTo ? { replyTo } : {}) }) as ${cast};`;
}

function renderValidatorCase(messageType: string, fields: MessageFields): string {
  const checks: string[] = [];
  for (const [field, spec] of Object.entries(fields)) {
    const { optional, check } = tsType(spec);
    if (!check) continue;
    const access = `payload.${field}`;
    const invalid =
      check === "object"
        ? `(typeof ${access} !== "object" || ${access} === null)`
        : `typeof ${access} !== "${check}"`;
    if (optional) {
      checks.push(
        `      if (${access} !== undefined && ${invalid}) return { ok: false, error: "${messageType}.${field} must be ${check}" };`,
      );
    } else {
      checks.push(
        `      if (${invalid}) return { ok: false, error: "${messageType}.${field} must be ${check}" };`,
      );
    }
  }
  const body = checks.length > 0 ? `${checks.join("\n")}\n      break;` : `      break;`;
  return `    case "${messageType}": {\n${body}\n    }`;
}

function collectRefs(groups: MessageFields[]): Set<string> {
  const refs = new Set<string>();
  for (const fields of groups) {
    for (const spec of Object.values(fields)) {
      const { ref } = tsType(spec);
      if (ref) refs.add(ref);
    }
  }
  return refs;
}

function renderImports(refs: Set<string>): string {
  const byModule = new Map<string, string[]>();
  for (const ref of refs) {
    const mod = REF_IMPORTS[ref];
    if (!mod) throw new Error(`No import mapping for referenced type: ${ref}`);
    const list = byModule.get(mod) ?? [];
    list.push(ref);
    byModule.set(mod, list);
  }
  const lines = [
    `import { envelope } from "./envelope.js";`,
    `import type { BaseMessage, ServerBroadcastEnvelope, TargetAudience } from "./envelope.js";`,
  ];
  for (const [mod, names] of byModule) {
    lines.push(`import type { ${names.sort().join(", ")} } from "${mod}";`);
  }
  return lines.join("\n");
}

function build(): string {
  const client = manifest.client as Record<string, MessageFields>;
  const server = manifest.server as Record<string, MessageFields>;

  const refs = collectRefs([...Object.values(client), ...Object.values(server)]);

  const sections: string[] = [];

  sections.push(renderImports(refs));

  const payloadInterfaces = [
    ...Object.entries(client),
    ...Object.entries(server),
  ].map(([type, fields]) => renderPayloadInterface(type, fields));
  sections.push(payloadInterfaces.join("\n\n"));

  const clientMapLines = Object.keys(client).map(
    (type) => `  "${type}": ${payloadTypeName(type)};`,
  );
  sections.push(`export interface ClientMessageMap {\n${clientMapLines.join("\n")}\n}`);

  const serverMapLines = Object.keys(server).map(
    (type) => `  "${type}": ${payloadTypeName(type)};`,
  );
  sections.push(`export interface ServerMessageMap {\n${serverMapLines.join("\n")}\n}`);

  sections.push(
    `export type ClientMessage = {\n  [K in keyof ClientMessageMap]: BaseMessage<ClientMessageMap[K]> & { type: K };\n}[keyof ClientMessageMap];`,
  );
  sections.push(
    `export type ServerMessage = {\n  [K in keyof ServerMessageMap]: ServerBroadcastEnvelope<ServerMessageMap[K]> & { type: K };\n}[keyof ServerMessageMap];`,
  );

  sections.push(
    Object.entries(client)
      .map(([type, fields]) => renderClientBuilder(type, fields))
      .join("\n\n"),
  );

  sections.push(
    Object.keys(server)
      .map((type) => renderServerBuilder(type))
      .join("\n\n"),
  );

  const validatorCases = Object.entries(client)
    .map(([type, fields]) => renderValidatorCase(type, fields))
    .join("\n");
  sections.push(
    `export function validateClient(\n  raw: unknown,\n): { ok: true; msg: ClientMessage } | { ok: false; error: string } {\n` +
      `  if (typeof raw !== "object" || raw === null) return { ok: false, error: "envelope is not an object" };\n` +
      `  const env = raw as Record<string, unknown>;\n` +
      `  if (typeof env.type !== "string") return { ok: false, error: "missing type" };\n` +
      `  if (typeof env.messageId !== "string") return { ok: false, error: "missing messageId" };\n` +
      `  if (typeof env.timestamp !== "number") return { ok: false, error: "missing timestamp" };\n` +
      `  if (typeof env.payload !== "object" || env.payload === null) return { ok: false, error: "missing payload" };\n` +
      `  const payload = env.payload as Record<string, unknown>;\n` +
      `  switch (env.type) {\n${validatorCases}\n` +
      `    default:\n      return { ok: false, error: \`unknown client message type: \${env.type}\` };\n` +
      `  }\n` +
      `  return { ok: true, msg: raw as ClientMessage };\n}`,
  );

  return sections.join("\n\n") + "\n";
}

const out = resolve(process.cwd(), "src/protocol/generated.ts");
writeFileSync(out, build());
process.stdout.write(`generated ${out}\n`);
