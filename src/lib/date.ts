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

/**
 * CSV/Excel 貼り付け用: YYYY-MM-DD のほか、Excel が出しがちな YYYY/M/D・YYYY.M.D などを YYYY-MM-DD に正規化する。
 * 暦日として不正な組み合わせは null。
 */
export function parseLessonDateFromPaste(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const t = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, "")
    .replace(/\u3000/g, "")
    .trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && isValidDate(t)) return t;
  const m = t.match(/^(\d{4})[./年\-](\d{1,2})[./月\-](\d{1,2})日?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isValidDate(iso) ? iso : null;
}
