/**
 * Recursive redaction layer (spec §59).
 * Applied BEFORE persistence, logging, model context, and UI rendering.
 */

const REDACTED = "[REDACTED]";

/** Key names whose values must always be redacted (case-insensitive). */
const SENSITIVE_KEYS = new Set(
  [
    "authorization",
    "cookie",
    "set-cookie",
    "password",
    "secret",
    "token",
    "apikey",
    "api_key",
    "accesstoken",
    "access_token",
    "refreshtoken",
    "refresh_token",
    "accountnumber",
    "account_number",
    "routingnumber",
    "routing_number",
    "ssn",
  ].map((k) => k.toLowerCase())
);

/** Value patterns that look like secrets/PII even under a benign key. */
const VALUE_PATTERNS: RegExp[] = [
  /\bbearer\s+[a-z0-9._-]+/gi, // bearer tokens
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
  /\bsk-[a-z0-9]{16,}\b/gi, // secret keys
];

function redactString(value: string): string {
  let out = value;
  for (const pattern of VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redactSensitive<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return redactString(value) as unknown as T;
  }

  if (typeof value !== "object") return value;

  if (seen.has(value as object)) return value; // cycle guard
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, seen)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else {
      out[key] = redactSensitive(v, seen);
    }
  }
  return out as unknown as T;
}

/** Convenience for header maps — drops sensitive headers entirely. */
export function redactHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? REDACTED : redactString(v);
  }
  return out;
}
