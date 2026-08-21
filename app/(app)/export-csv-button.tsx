"use client";

import { downloadCsv } from "./download-csv";

/** Data passed as props (not the export itself — `downloadCsv` runs on click), so a Server
 *  Component can hand this a plain array of already-computed rows without needing its own
 *  "use client" boundary. */
export function ExportCsvButton({
  filename,
  headers,
  rows,
  label = "Xuất CSV",
  className = "",
}: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, headers, rows)}
      className={`flex h-[32px] shrink-0 items-center gap-1.5 rounded-btn border border-line px-3 text-[12.5px] font-semibold hover:bg-surface ${className}`}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
      {label}
    </button>
  );
}
