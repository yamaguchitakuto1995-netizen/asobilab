import { parseLessonDateFromPaste } from "@/lib/date";
import { formatTimeRange } from "@/lib/periodTimes";
import {
  CLASSROOM_NAMES,
  COURSE_SUBJECTS,
  MAX_PERIOD,
  classroomSubjects,
  type ClassroomPeriodTime,
  type CourseSubject,
} from "@/lib/types";

export type PeriodTimeCsvRow = {
  classroom: string;
  lesson_date: string;
  period: number;
  subject: string | null;
  start_time: string;
  end_time: string;
  note: string | null;
};

export type PeriodTimeCsvParsedRow = PeriodTimeCsvRow & {
  /** CSV 上の行番号（1行目=ヘッダー、2行目=データ1） */
  line: number;
};

export type PeriodTimeCsvDuplicateGroup = {
  key: string;
  label: string;
  lines: number[];
};

export type PeriodTimeCsvOverwrite = {
  label: string;
  before: string;
  after: string;
};

export type PeriodTimeCsvImportPlan = {
  rows: PeriodTimeCsvParsedRow[];
  csvDuplicates: PeriodTimeCsvDuplicateGroup[];
  toInsert: PeriodTimeCsvRow[];
  toUpdate: {
    id: string;
    row: PeriodTimeCsvRow;
    overwrite: PeriodTimeCsvOverwrite;
  }[];
};

/** 貼り付け由来のゼロ幅・NBSP・全角スペースを除去 */
export function normalizePasteCell(s: string): string {
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\u3000/g, " ")
    .trim();
}

export function splitTableRow(line: string): string[] {
  const parts = (() => {
    if (line.includes("\t")) return line.split(/\t/);
    const commas = (line.match(/,/g) ?? []).length;
    const semis = (line.match(/;/g) ?? []).length;
    if (semis > commas) return line.split(";");
    return line.split(",");
  })();
  return parts.map(normalizePasteCell);
}

export function periodTimeNaturalKey(
  row: Pick<PeriodTimeCsvRow, "classroom" | "lesson_date" | "period" | "subject">
): string {
  return `${row.classroom}|${row.lesson_date}|${row.period}|${row.subject ?? ""}`;
}

export function periodTimeSlotLabelFromRow(
  row: Pick<PeriodTimeCsvRow, "classroom" | "lesson_date" | "period" | "subject">
): string {
  const subj = row.subject ?? "全教科共通";
  return `${row.classroom}・${row.lesson_date}・${row.period}コマ目・${subj}`;
}

function parseTimeCell(raw: string): string | null {
  const t = raw.trim();
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) return null;
  return t.length === 5 ? `${t}:00` : t.slice(0, 8);
}

function parseDataRow(
  cells: string[],
  line: number,
  cols: {
    iClass: number;
    iDate: number;
    iPeriod: number;
    iSub: number;
    iStart: number;
    iEnd: number;
    iNote: number;
  }
): PeriodTimeCsvParsedRow | null {
  const classroom = normalizePasteCell(cells[cols.iClass] ?? "");
  const lesson_date = parseLessonDateFromPaste(cells[cols.iDate] ?? "");
  const period = Number(cells[cols.iPeriod]);
  const subjectCell = cols.iSub >= 0 ? (cells[cols.iSub] ?? "").trim() : "";
  const subject =
    !subjectCell || subjectCell === "-" || subjectCell.toLowerCase() === "null"
      ? null
      : subjectCell;
  const start_time = parseTimeCell(cells[cols.iStart] ?? "");
  const end_time = parseTimeCell(cells[cols.iEnd] ?? "");
  const note =
    cols.iNote >= 0 ? (cells[cols.iNote] ?? "").trim() || null : null;

  if (!(CLASSROOM_NAMES as readonly string[]).includes(classroom)) return null;
  if (!lesson_date) return null;
  if (!Number.isInteger(period) || period < 1 || period > MAX_PERIOD) return null;
  if (subject && !(COURSE_SUBJECTS as readonly string[]).includes(subject))
    return null;
  if (
    subject &&
    !classroomSubjects(classroom).includes(subject as CourseSubject)
  )
    return null;
  if (!start_time || !end_time) return null;
  if (start_time >= end_time) return null;

  return {
    line,
    classroom,
    lesson_date,
    period,
    subject,
    start_time,
    end_time,
    note,
  };
}

export function parsePeriodTimesCsv(raw: string):
  | { ok: true; parsed: PeriodTimeCsvParsedRow[] }
  | { ok: false; error: string } {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return { ok: false, error: "CSV を貼り付けてください。" };

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { ok: false, error: "ヘッダー行とデータ行が必要です。" };
  }

  const header = splitTableRow(lines[0]).map((s) => s.toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const iClass = idx("classroom");
  const iDate = idx("lesson_date");
  const iPeriod = idx("period");
  const iSub = idx("subject");
  const iStart = idx("start_time");
  const iEnd = idx("end_time");
  const iNote = idx("note");

  if (iClass < 0 || iDate < 0 || iPeriod < 0 || iStart < 0 || iEnd < 0) {
    return {
      ok: false,
      error:
        "必須列: classroom, lesson_date, period, start_time, end_time（日付は YYYY-MM-DD または Excel の 2026/5/10 形式）",
    };
  }

  const cols = { iClass, iDate, iPeriod, iSub, iStart, iEnd, iNote };
  const parsed: PeriodTimeCsvParsedRow[] = [];

  for (let r = 1; r < lines.length; r++) {
    const row = parseDataRow(splitTableRow(lines[r]), r + 1, cols);
    if (row) parsed.push(row);
  }

  if (parsed.length === 0) {
    return {
      ok: false,
      error: "取り込める有効な行がありませんでした。列名・値を確認してください。",
    };
  }

  return { ok: true, parsed };
}

/** CSV 内の重複を検出し、同一キーは最後の行を採用する */
export function dedupeCsvRows(parsed: PeriodTimeCsvParsedRow[]): {
  rows: PeriodTimeCsvParsedRow[];
  csvDuplicates: PeriodTimeCsvDuplicateGroup[];
} {
  const groups = new Map<string, PeriodTimeCsvParsedRow[]>();
  for (const row of parsed) {
    const key = periodTimeNaturalKey(row);
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  const csvDuplicates: PeriodTimeCsvDuplicateGroup[] = [];
  const rows: PeriodTimeCsvParsedRow[] = [];

  for (const [key, arr] of groups) {
    if (arr.length > 1) {
      csvDuplicates.push({
        key,
        label: periodTimeSlotLabelFromRow(arr[0]!),
        lines: arr.map((r) => r.line),
      });
    }
    rows.push(arr[arr.length - 1]!);
  }

  csvDuplicates.sort((a, b) => a.lines[0]! - b.lines[0]!);
  return { rows, csvDuplicates };
}

export function buildPeriodTimeImportPlan(
  csvRows: PeriodTimeCsvParsedRow[],
  existing: ClassroomPeriodTime[]
): PeriodTimeCsvImportPlan {
  const { rows, csvDuplicates } = dedupeCsvRows(csvRows);

  const existingByKey = new Map(
    existing.map((e) => [periodTimeNaturalKey(e), e] as const)
  );

  const toInsert: PeriodTimeCsvRow[] = [];
  const toUpdate: PeriodTimeCsvImportPlan["toUpdate"] = [];

  for (const { line: _line, ...row } of rows) {
    const ex = existingByKey.get(periodTimeNaturalKey(row));
    if (ex) {
      toUpdate.push({
        id: ex.id,
        row,
        overwrite: {
          label: periodTimeSlotLabelFromRow(row),
          before: formatTimeRange(ex.start_time, ex.end_time),
          after: formatTimeRange(row.start_time, row.end_time),
        },
      });
    } else {
      toInsert.push(row);
    }
  }

  return { rows, csvDuplicates, toInsert, toUpdate };
}

export function formatCsvDuplicateMessage(groups: PeriodTimeCsvDuplicateGroup[]): string {
  if (groups.length === 0) return "";
  return groups
    .map((g) => `${g.lines.join("・")}行目 → ${g.label}（最後の行を採用）`)
    .join("\n");
}

export function formatOverwriteMessage(
  overwrites: PeriodTimeCsvOverwrite[],
  max = 20
): string {
  if (overwrites.length === 0) return "";
  const shown = overwrites.slice(0, max);
  const rest = overwrites.length - shown.length;
  const body = shown
    .map((o) => `${o.label}: ${o.before} → ${o.after}`)
    .join("\n");
  return rest > 0 ? `${body}\n（他 ${rest} 件）` : body;
}
