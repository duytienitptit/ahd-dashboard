// Small hand-rolled request validation. Four route handlers do not justify a schema-validation
// dependency (zod, valibot, ...) on top of an already lean package.json — see M2 plan notes.

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ValidationError("Body phải là JSON hợp lệ.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Body phải là một object JSON.");
  }
  return body as Record<string, unknown>;
}

export function requireString(
  body: Record<string, unknown>,
  field: string,
  opts?: { min?: number; max?: number },
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`Thiếu trường bắt buộc "${field}".`);
  }
  const trimmed = value.trim();
  if (opts?.min !== undefined && trimmed.length < opts.min) {
    throw new ValidationError(`Trường "${field}" phải có ít nhất ${opts.min} ký tự.`);
  }
  if (opts?.max !== undefined && trimmed.length > opts.max) {
    throw new ValidationError(`Trường "${field}" không được quá ${opts.max} ký tự.`);
  }
  return trimmed;
}

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

/** Login identifier — replaces email at the UI layer (22/08/2026). Same pattern the DB CHECK
 *  constraint enforces (supabase/migrations/20260822000001_username.sql) — checked here too so a
 *  bad value fails with a clear message instead of a raw Postgres constraint error. */
export function requireUsername(body: Record<string, unknown>, field: string): string {
  const value = requireString(body, field, { max: 32 }).toLowerCase();
  if (!USERNAME_RE.test(value)) {
    throw new ValidationError(
      `"${field}" chỉ được chứa chữ thường, số, dấu chấm/gạch dưới/gạch ngang, 3-32 ký tự.`,
    );
  }
  return value;
}

/** `undefined` = field omitted, leave unchanged. Only meaningful in PATCH bodies. */
export function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`Trường "${field}" phải là chuỗi.`);
  }
  return value.trim();
}

export function optionalBoolean(body: Record<string, unknown>, field: string): boolean | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ValidationError(`Trường "${field}" phải là true/false.`);
  }
  return value;
}

const DATE_STRING_RE = /^\d{4}-\d{2}-\d{2}$/;

export function requireDateString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !DATE_STRING_RE.test(value)) {
    throw new ValidationError(`Trường "${field}" phải có dạng YYYY-MM-DD.`);
  }
  return value;
}

/** `undefined` = field omitted (don't touch it) — manual-entry's 3 metric fields are each
 *  independently optional, since a Manager patching in for a broken API often only knows some of
 *  the numbers (docs/DATA_SOURCES.md "Nhập tay khi API lỗi"). */
export function optionalNonNegativeInt(body: Record<string, unknown>, field: string): number | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`Trường "${field}" phải là số nguyên không âm.`);
  }
  return value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Three-state, not two: `undefined` = field omitted (leave unchanged), `null` = field explicitly
 * cleared (e.g. un-assigning a channel's Creator), a string = a uuid to set. `PATCH
 * /api/channels/:id`'s `creatorId` needs all three — collapsing null and undefined would make
 * "un-assign this channel" inexpressible.
 */
export function optionalUuid(body: Record<string, unknown>, field: string): string | null | undefined {
  const value = body[field];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new ValidationError(`Trường "${field}" phải là uuid hợp lệ hoặc null.`);
  }
  return value;
}

/**
 * Accepts a bare handle ("vuonvuonvang" / "@vuonvuonvang" / "VuonVuonVang"), or a full profile URL
 * ("https://www.tiktok.com/@vuonvuonvang?lang=en"), and normalizes to the canonical lowercase
 * "@handle" form stored in `channel.tiktok_handle`.
 */
export function normalizeTiktokHandle(input: string): string {
  let value = input.trim();

  const urlMatch = value.match(/tiktok\.com\/(@[^/?#]+)/i);
  if (urlMatch) value = urlMatch[1];

  value = value.trim();
  if (!value.startsWith("@")) value = `@${value}`;
  value = value.toLowerCase();

  // TikTok handles: 2-24 chars after the @, letters/digits/underscore/period.
  if (!/^@[a-z0-9._]{2,24}$/.test(value)) {
    throw new ValidationError(`Handle TikTok không hợp lệ: "${input}".`);
  }

  return value;
}
