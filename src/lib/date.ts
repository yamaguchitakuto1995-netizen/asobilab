export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateShort(d: string): string {
  const date = new Date(`${d}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function formatDateLong(d: string): string {
  const date = new Date(`${d}T00:00:00`);
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} (${w})`;
}

export function ymKey(d: string): string {
  return d.slice(0, 7);
}

export function ymLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

export function shiftMonth(ym: string, delta: number): string {
  const [yy, mm] = ym.split("-").map(Number);
  const date = new Date(yy, mm - 1 + delta, 1);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
}

export function currentYm(): string {
  return todayIso().slice(0, 7);
}

/** YYYY-MM-DD を delta 日だけ前後にずらす */
export function shiftDate(d: string, delta: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  const date = new Date(y, m - 1, dd + delta);
  const yy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dn = `${date.getDate()}`.padStart(2, "0");
  return `${yy}-${mm}-${dn}`;
}

/** 入力値が YYYY-MM-DD として妥当か */
export function isValidDate(d: string | undefined | null): d is string {
  if (!d) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, dd] = d.split("-").map(Number);
  const date = new Date(y, m - 1, dd);
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === dd
  );
}
