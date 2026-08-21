// Minimal CSV reader for TikTok Studio exports. See docs/CSV_FORMAT.md for the exact traps this
// has to handle — most importantly the leading BOM every export file starts with.

/** Strips the `EF BB BF` BOM every Studio CSV starts with, then parses quoted-field CSV rows into
 *  objects keyed by the header row. Tolerates a missing trailing newline (real exports vary). */
export function parseCsv(text: string): Record<string, string>[] {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < withoutBom.length; i += 1) {
    const char = withoutBom[i];

    if (quoted) {
      if (char === '"' && withoutBom[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell !== ""));
  const [header, ...body] = nonEmptyRows;
  if (!header) return [];

  return body.map((cells) => Object.fromEntries(header.map((key, i) => [key, cells[i] ?? ""])));
}

/**
 * `"undefined"` in a Studio export means "no data yet for this day" and must become `null`, never
 * `0` — the two are different states (docs/CSV_FORMAT.md point 4). Empty string is treated the same
 * way; a genuine `0` parses to `0`.
 */
export function parseNullableInt(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (value === "" || value === "undefined") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Same as `parseNullableInt`, but for the `Distribution` ratio columns (e.g. `"0.55"`). */
export function parseNullableFloat(raw: string | undefined): number | null {
  const value = (raw ?? "").trim();
  if (value === "" || value === "undefined") return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}
