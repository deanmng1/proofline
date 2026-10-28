export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const escapeCell = (cell: string | number): string => `"${String(cell).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");

  if (typeof URL.createObjectURL !== "function") {
    return;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
