/**
 * Escape a value for CSV. Wraps in quotes if it contains commas, quotes, or newlines.
 */
function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = Array.isArray(value) ? value.join("; ") : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Download an array of objects as a CSV file.
 */
export function downloadCSV(
  rows: Record<string, unknown>[],
  headers: { key: string; label: string }[],
  filename: string
): void {
  const headerRow = headers.map((h) => escapeCSV(h.label)).join(",");
  const dataRows = rows.map((row) =>
    headers.map((h) => escapeCSV(row[h.key])).join(",")
  );
  const csv = [headerRow, ...dataRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
