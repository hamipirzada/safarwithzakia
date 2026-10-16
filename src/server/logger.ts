/**
 * Minimal structured logger (one JSON line per event, captured by the host's log drain).
 * Never pass customer PII (names, emails, phone numbers, messages) or secrets in `fields`;
 * log identifiers such as enquiry references and delivery ids instead.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

const SECRET_PATTERN = /(ya29\.[\w-]+|1\/\/[\w-]{20,}|Bearer\s+[\w.-]+)/g;

function scrub(value: unknown): unknown {
  return typeof value === "string" ? value.replace(SECRET_PATTERN, "[redacted]") : value;
}

function write(level: Level, event: string, fields: Fields = {}): void {
  if (level === "debug" && process.env.NODE_ENV === "production") return;
  const entry: Record<string, unknown> = { level, event, time: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) entry[key] = scrub(value);
  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (event: string, fields?: Fields) => write("debug", event, fields),
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

export function errorMessage(error: unknown): string {
  return String(scrub(error instanceof Error ? error.message : String(error))).slice(0, 500);
}
