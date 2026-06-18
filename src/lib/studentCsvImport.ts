import {
  normalizePasteCell,
  splitTableRow,
} from "@/lib/periodTimeCsvImport";
import {
  parseDayOfWeekCell,
  parsePeriodCell,
  parseRegularSlotCells,
  parseWeekGroupCell,
  resolveEnrollmentCapacityId,
  type RegularSlotParts,
} from "@/lib/regularSlot";
import {
  classroomSubjects,
  COURSE_SUBJECTS,
  GRADE_LEVELS,
  type ClassroomRecord,
  type CourseSubject,
  type GradeLevel,
  type LessonCapacity,
} from "@/lib/types";
import { isKnownClassroom } from "@/lib/classrooms";

export type StudentCsvRow = {
  student_id: string | null;
  name: string;
  grade: GradeLevel;
  classroom: string;
  subjects: CourseSubject[];
  robotSlot: RegularSlotParts | null;
  progSlot: RegularSlotParts | null;
  note: string | null;
  external_id: string | null;
};

export type StudentCsvParsedRow = StudentCsvRow & {
  line: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function headerIndex(header: string[], names: string[]): number {
  for (const n of names) {
    const i = header.indexOf(n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function parseSubjectsCell(raw: string): CourseSubject[] {
  const parts = raw
    .split(/[;；、,，/／]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.filter((s): s is CourseSubject =>
    (COURSE_SUBJECTS as readonly string[]).includes(s)
  );
}

function readOptionalSlot(
  cells: string[],
  iWeek: number,
  iDay: number,
  iPeriod: number,
  subjectLabel: string,
  line: number
): { slot: RegularSlotParts | null; error?: string } {
  if (iWeek < 0 && iDay < 0 && iPeriod < 0) {
    return { slot: null };
  }

  const weekRaw = iWeek >= 0 ? (cells[iWeek] ?? "") : "";
  const dayRaw = iDay >= 0 ? (cells[iDay] ?? "") : "";
  const periodRaw = iPeriod >= 0 ? (cells[iPeriod] ?? "") : "";

  if (!weekRaw.trim() && !dayRaw.trim() && !periodRaw.trim()) {
    return { slot: null };
  }

  const parsed = parseRegularSlotCells(weekRaw, dayRaw, periodRaw);
  if (!parsed.ok) {
    return {
      slot: null,
      error: `${line}行目・${subjectLabel}: ${parsed.error}`,
    };
  }
  return { slot: parsed.parts };
}

function parseDataRow(
  cells: string[],
  line: number,
  cols: {
    iId: number;
    iName: number;
    iGrade: number;
    iClass: number;
    iSubj: number;
    iNote: number;
    iExt: number;
    iRobotWeek: number;
    iRobotDay: number;
    iRobotPeriod: number;
    iProgWeek: number;
    iProgDay: number;
    iProgPeriod: number;
  },
  classrooms: readonly ClassroomRecord[]
): { row: StudentCsvParsedRow } | { error: string } {
  const name = normalizePasteCell(cells[cols.iName] ?? "");
  const gradeRaw = normalizePasteCell(cells[cols.iGrade] ?? "");
  const classroom = normalizePasteCell(cells[cols.iClass] ?? "");
  const subjects = parseSubjectsCell(cells[cols.iSubj] ?? "");
  const note =
    cols.iNote >= 0 ? normalizePasteCell(cells[cols.iNote] ?? "") || null : null;
  const external_id =
    cols.iExt >= 0
      ? normalizePasteCell(cells[cols.iExt] ?? "") || null
      : null;

  let student_id: string | null = null;
  if (cols.iId >= 0) {
    const raw = normalizePasteCell(cells[cols.iId] ?? "");
    if (raw) {
      if (!UUID_RE.test(raw)) {
        return { error: `${line}行目: student_id（UUID）の形式が不正です。` };
      }
      student_id = raw;
    }
  }

  if (!name) {
    return { error: `${line}行目: 氏名が空です。` };
  }
  if (!(GRADE_LEVELS as readonly string[]).includes(gradeRaw as GradeLevel)) {
    return { error: `${line}行目: 学年「${gradeRaw}」が不正です。` };
  }
  if (!isKnownClassroom(classroom, classrooms)) {
    return { error: `${line}行目: 教室「${classroom}」が不正です。` };
  }
  if (subjects.length === 0) {
    return { error: `${line}行目: 教科が空または不正です。` };
  }

  const invalidSubj = subjects.filter(
    (s) => !classroomSubjects(classroom, classrooms).includes(s)
  );
  if (invalidSubj.length > 0) {
    return {
      error: `${line}行目: ${classroom} では「${invalidSubj.join("・")}」を開講していません。`,
    };
  }

  const robot = readOptionalSlot(
    cells,
    cols.iRobotWeek,
    cols.iRobotDay,
    cols.iRobotPeriod,
    "ロボット",
    line
  );
  if (robot.error) return { error: robot.error };

  const prog = readOptionalSlot(
    cells,
    cols.iProgWeek,
    cols.iProgDay,
    cols.iProgPeriod,
    "プログラミング",
    line
  );
  if (prog.error) return { error: prog.error };

  if (subjects.includes("ロボット") && !robot.slot) {
    return {
      error: `${line}行目: ロボット受講の場合、ロボット_週グループ・曜日・コマを指定してください。`,
    };
  }
  if (subjects.includes("プログラミング") && !prog.slot) {
    return {
      error: `${line}行目: プログラミング受講の場合、プログラミング_週グループ・曜日・コマを指定してください。`,
    };
  }
  if (!subjects.includes("ロボット") && robot.slot) {
    return {
      error: `${line}行目: ロボットを受講していないのにロボットのレギュラーコマが指定されています。`,
    };
  }
  if (!subjects.includes("プログラミング") && prog.slot) {
    return {
      error: `${line}行目: プログラミングを受講していないのにプログラミングのレギュラーコマが指定されています。`,
    };
  }

  return {
    row: {
      line,
      student_id,
      name,
      grade: gradeRaw as GradeLevel,
      classroom,
      subjects,
      robotSlot: robot.slot,
      progSlot: prog.slot,
      note,
      external_id,
    },
  };
}

export function parseStudentsCsv(
  raw: string,
  classrooms: readonly ClassroomRecord[]
):
  | { ok: true; parsed: StudentCsvParsedRow[] }
  | { ok: false; error: string } {
  const text = raw.replace(/^\uFEFF/, "").trim();
  if (!text) return { ok: false, error: "CSV を貼り付けてください。" };

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { ok: false, error: "ヘッダー行とデータ行が必要です。" };
  }

  const header = splitTableRow(lines[0]).map((s) => s.toLowerCase());

  const iId = headerIndex(header, ["student_id", "id"]);
  const iName = headerIndex(header, ["氏名", "name"]);
  const iGrade = headerIndex(header, ["学年", "grade"]);
  const iClass = headerIndex(header, ["教室", "所属教室", "classroom"]);
  const iSubj = headerIndex(header, ["教科", "受講教科", "subjects"]);
  const iNote = headerIndex(header, ["メモ", "note"]);
  const iExt = headerIndex(header, ["外部id", "external_id"]);

  const iRobotWeek = headerIndex(header, [
    "ロボット_週グループ",
    "robot_week_group",
  ]);
  const iRobotDay = headerIndex(header, [
    "ロボット_曜日",
    "robot_day_of_week",
    "robot_day",
  ]);
  const iRobotPeriod = headerIndex(header, [
    "ロボット_コマ",
    "robot_period",
  ]);
  const iProgWeek = headerIndex(header, [
    "プログラミング_週グループ",
    "prog_week_group",
    "programming_week_group",
  ]);
  const iProgDay = headerIndex(header, [
    "プログラミング_曜日",
    "prog_day_of_week",
    "programming_day_of_week",
  ]);
  const iProgPeriod = headerIndex(header, [
    "プログラミング_コマ",
    "prog_period",
    "programming_period",
  ]);

  if (iName < 0 || iGrade < 0 || iClass < 0 || iSubj < 0) {
    return {
      ok: false,
      error:
        "必須列: 氏名(name), 学年(grade), 教室(classroom), 教科(subjects)。レギュラーコマ列も必要です。",
    };
  }

  const cols = {
    iId,
    iName,
    iGrade,
    iClass,
    iSubj,
    iNote,
    iExt,
    iRobotWeek,
    iRobotDay,
    iRobotPeriod,
    iProgWeek,
    iProgDay,
    iProgPeriod,
  };

  const parsed: StudentCsvParsedRow[] = [];

  for (let r = 1; r < lines.length; r++) {
    const result = parseDataRow(splitTableRow(lines[r]), r + 1, cols, classrooms);
    if ("error" in result) {
      return { ok: false, error: result.error };
    }
    parsed.push(result.row);
  }

  if (parsed.length === 0) {
    return { ok: false, error: "取り込めるデータ行がありません。" };
  }

  return { ok: true, parsed };
}

export function resolveStudentCsvSlots(
  row: StudentCsvRow,
  capacities: LessonCapacity[]
): { robotCapacityId: string | null; progCapacityId: string | null; error?: string } {
  let robotCapacityId: string | null = null;
  let progCapacityId: string | null = null;

  if (row.robotSlot) {
    robotCapacityId = resolveEnrollmentCapacityId(capacities, {
      classroom: row.classroom,
      subject: "ロボット",
      ...row.robotSlot,
    });
    if (!robotCapacityId) {
      return {
        robotCapacityId: null,
        progCapacityId: null,
        error: `「${row.name}」: ロボットのレギュラーコマが振替枠設定に見つかりません（${row.classroom}）。`,
      };
    }
  }

  if (row.progSlot) {
    progCapacityId = resolveEnrollmentCapacityId(capacities, {
      classroom: row.classroom,
      subject: "プログラミング",
      ...row.progSlot,
    });
    if (!progCapacityId) {
      return {
        robotCapacityId: null,
        progCapacityId: null,
        error: `「${row.name}」: プログラミングのレギュラーコマが振替枠設定に見つかりません（${row.classroom}）。`,
      };
    }
  }

  return { robotCapacityId, progCapacityId };
}

/** ヘッダー例（ドキュメント・サンプル用） */
export const STUDENT_CSV_HEADER =
  "student_id,氏名,学年,教室,教科,ロボット_週グループ,ロボット_曜日,ロボット_コマ,プログラミング_週グループ,プログラミング_曜日,プログラミング_コマ,メモ,外部ID";

export { parseWeekGroupCell, parseDayOfWeekCell, parsePeriodCell };
