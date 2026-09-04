const DEFAULT_PORT = 3001;
const DEFAULT_ORIGIN = 'http://localhost:5173';

function readPort(): number {
  const raw = process.env['PORT'];
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

/** Comma-separated so a deployment can allow a prod origin alongside localhost. */
function readOrigins(): string[] {
  const raw = process.env['CLIENT_ORIGIN'] ?? DEFAULT_ORIGIN;
  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}

export const env = {
  port: readPort(),
  clientOrigins: readOrigins(),
} as const;
