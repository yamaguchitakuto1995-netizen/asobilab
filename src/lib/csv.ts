/** CSV 1セルのエスケープ（RFC 4180 想定・Excel 向けに改行もクォート） */
export function csvEscapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsvRow(cells: unknown[]): string {
  return cells.map(csvEscapeCell).join(",");
}
