/** Client-only — triggers a browser file download, so this must never be imported from a Server
 *  Component. Kept as a plain function (not a component) so any client component can call it from
 *  a button's `onClick` without extra wiring. */

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

/** Builds an RFC4180-ish CSV (comma-separated, `\r\n` rows) and saves it via a throwaway
 *  object URL + click — no server round trip, the data's already on the client either way. */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  // Leading BOM so Excel (still common for a Manager's spreadsheet habits) opens UTF-8 Vietnamese
  // text correctly instead of mangling diacritics.
  const csv = "﻿" + lines.join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
