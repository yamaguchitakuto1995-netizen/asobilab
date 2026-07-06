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
  buildProgrammingNextTextFromParts,
  buildRobotNextTextFromParts,
  isProgrammingNextText,
  isRobotNextText,
  parseRobotNextTextParts,
  ROBOT_NEXT_TEXT_OPTIONS,
  TWO_LAP_ROBOT_COURSES,
} from "@/lib/courseNextText";
import {
  normalizeBirthdayMmdd,
  isValidBirthdayMmdd,
} from "@/lib/birthdayMmdd";
import { readPortalIdFromInput } from "@/lib/studentPortal";
import { isValidYearMonth } from "@/lib/studentWithdrawal";
import type { PromotionType } from "@/lib/studentPromotion";
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
  name_kana: string | null;
  grade: GradeLevel;
  classroom: string;
  subjects: CourseSubject[];
  portal_id: string | null;
  birthday: string | null;
  robotSlot: RegularSlotParts | null;
  robot_course: string | null;
  robot_text: string | null;
  next_text_robot: string | null;
  next_text_robot_course: string | null;
  next_text_robot_text: string | null;
  progSlot: RegularSlotParts | null;
  prog_course: string | null;
  prog_text: string | null;
  next_text_programming: string | null;
  next_text_programming_course: string | null;
  next_text_programming_text: string | null;
  course_start_robot_ym: string | null;
  course_start_programming_ym: string | null;
  promotion_scheduled_ym: string | null;
  promotion_type: PromotionType;
  scratch_login_id: string | null;
  scratch_login_pass: string | null;
  minecraft_login: string | null;
  leave_from_ym: string | null;
  leave_until_ym: string | null;
  withdrawal_until_ym: string | null;
  persistent_memo: string | null;
  note: string | null;
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

function isCsvHeaderRow(cells: string[]): boolean {
  const lower = cells.map((c) => c.toLowerCase());
  return (
    lower.some((c) => c === "氏名" || c === "name" || c === "student_id") ||
    lower.some((c) => c.includes("ロボット_週グループ"))
  );
}

/** スプレッドシート貼り付けで先頭に空列が付く場合のオフセット */
function detectLeadingOffset(cells: string[]): number {
  for (const offset of [0, 1, 2]) {
    const grade = normalizePasteCell(cells[offset + 3] ?? "");
    const subjectCell = normalizePasteCell(cells[offset + 5] ?? "");
    const hasSubject = parseSubjectsCell(subjectCell).length > 0;
    if (
      (GRADE_LEVELS as readonly string[]).includes(grade as GradeLevel) &&
      hasSubject
    ) {
      return offset;
    }
  }
  return 0;
}

function buildPositionalColumnIndexes(offset: number) {
  const base = buildColumnIndexes(
    STUDENT_CSV_HEADER.split(",").map((s) => s.toLowerCase())
  );
  const shifted = { ...base } as Record<string, number>;
  for (const key of Object.keys(shifted)) {
    if (shifted[key] >= 0) shifted[key] += offset;
  }
  return shifted as ReturnType<typeof buildColumnIndexes>;
}

function normalizeUnitMiddleDot(text: string): string {
  return text.replace(/(\d+)[･·.](\d+)/g, "$1・$2");
}

function normalizeRobotCourseName(raw: string): string {
  const t = raw.trim();
  if (t === "アドバンス") return "アドバンス（2周）";
  return t;
}

function normalizeRobotTextForCourse(course: string, text: string): string {
  let t = normalizeUnitMiddleDot(text.trim());
  if (!t) return t;
  const c = normalizeRobotCourseName(course);
  if (!TWO_LAP_ROBOT_COURSES.has(c) || t.includes("周目")) return t;
  if (/^\d+-\d+$/.test(t) || /^\d+・\d+-\d+$/.test(t)) {
    return `1周目 / ${t}`;
  }
  return t;
}

function defaultRobotTextForCourse(course: string): string | null {
  const c = normalizeRobotCourseName(course);
  if (c === "アドバンス（2周）") return "1周目 / 2・3-1";
  if (TWO_LAP_ROBOT_COURSES.has(c)) return "1周目 / 7-1";
  return "1-1";
}

function readCourseTextCells(
  cells: string[],
  iCourse: number,
  iText: number
): { course: string; text: string } {
  const course = readOptionalCell(cells, iCourse).trim();
  let text = readOptionalCell(cells, iText).trim();
  if (course && !text) {
    const fallback = defaultRobotTextForCourse(course);
    if (fallback) text = fallback;
  }
  return { course, text };
}

function inferSubjectsFromRow(
  initial: CourseSubject[],
  robotSlot: RegularSlotParts | null,
  progSlot: RegularSlotParts | null,
  robotCourse: string,
  progCourse: string
): CourseSubject[] {
  const set = new Set<CourseSubject>(initial);
  if (robotSlot || robotCourse.trim()) set.add("ロボット");
  if (progSlot || progCourse.trim()) set.add("プログラミング");
  return [...set];
}

function resolveRobotNextTextFromCsv(
  courseRaw: string,
  textRaw: string,
  line: number
): {
  combined: string | null;
  course: string | null;
  text: string | null;
  error?: string;
} {
  const course = normalizeRobotCourseName(courseRaw);
  const text = normalizeRobotTextForCourse(course, textRaw);
  if (!course && !text) {
    return { combined: null, course: null, text: null };
  }
  if (!course || !text) {
    return {
      combined: null,
      course: null,
      text: null,
      error: `${line}行目: ロボットのコースとテキスト名は両方指定してください。`,
    };
  }

  const built = buildRobotNextTextFromParts(course, text);
  if (isRobotNextText(built)) {
    const parts = parseRobotNextTextParts(built)!;
    return { combined: built, course: parts.course, text: parts.text };
  }

  const unitOnly = text.replace(/^\d+周目\s*\/\s*/, "").trim();
  for (const opt of ROBOT_NEXT_TEXT_OPTIONS) {
    const parts = parseRobotNextTextParts(opt);
    if (parts?.course !== course) continue;
    if (parts.text === text) {
      return { combined: opt, course: parts.course, text: parts.text };
    }
    const optUnit = parts.text.replace(/^\d+周目\s*\/\s*/, "").trim();
    if (optUnit === unitOnly) {
      return { combined: opt, course: parts.course, text: parts.text };
    }
  }

  const hint =
    course === "アドバンス（2周）"
      ? "（例: 1周目 / 2・3-1、1周目 / 6・7-1、2周目 / 2・3-1）"
      : "";
  return {
    combined: null,
    course: null,
    text: null,
    error: `${line}行目: ロボットのコース・テキスト名の組み合わせが不正です（${course} / ${text}）${hint}。`,
  };
}

function preprocessCsvLines(raw: string): string[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const merged: string[] = [];

  for (const line of lines) {
    const cleaned = line.replace(/^"+|"+$/g, "").trim();
    if (!cleaned) continue;

    const cells = splitTableRow(cleaned);
    const nonEmpty = cells.filter((c) => c.trim()).length;

    if (merged.length > 0 && nonEmpty < 5) {
      const prev = merged[merged.length - 1]!;
      merged[merged.length - 1] = prev + cleaned.replace(/^,/, ",");
      continue;
    }

    merged.push(cleaned);
  }

  return merged;
}

function swapMisplacedCourseStartYm(
  subjects: CourseSubject[],
  robot: { value: string | null },
  prog: { value: string | null }
): void {
  const robotOnly =
    subjects.includes("ロボット") && !subjects.includes("プログラミング");
  const progOnly =
    subjects.includes("プログラミング") && !subjects.includes("ロボット");
  if (robotOnly && !robot.value && prog.value) {
    robot.value = prog.value;
    prog.value = null;
  }
  if (progOnly && !prog.value && robot.value) {
    prog.value = robot.value;
    robot.value = null;
  }
}

function readOptionalCell(cells: string[], index: number): string {
  if (index < 0) return "";
  return normalizePasteCell(cells[index] ?? "");
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

function readOptionalYearMonth(
  raw: string,
  label: string,
  line: number
): { value: string | null; error?: string } {
  if (!raw.trim()) return { value: null };
  if (!isValidYearMonth(raw)) {
    return {
      value: null,
      error: `${line}行目: ${label}の形式が不正です（YYYY-MM）。`,
    };
  }
  return { value: raw.trim() };
}

function readNextTextPair(
  courseRaw: string,
  textRaw: string,
  subjectLabel: string,
  line: number,
  build: (course: string, text: string) => string,
  isValid: (s: string) => boolean
): {
  combined: string | null;
  course: string | null;
  text: string | null;
  error?: string;
} {
  const course = courseRaw.trim();
  const text = textRaw.trim();
  if (!course && !text) {
    return { combined: null, course: null, text: null };
  }
  if (!course || !text) {
    return {
      combined: null,
      course: null,
      text: null,
      error: `${line}行目: ${subjectLabel}のコースとテキスト名は両方指定してください。`,
    };
  }
  const combined = build(course, text);
  if (!isValid(combined)) {
    return {
      combined: null,
      course: null,
      text: null,
      error: `${line}行目: ${subjectLabel}のコース・テキスト名の組み合わせが不正です。`,
    };
  }
  return { combined, course, text };
}

function parseDataRow(
  cells: string[],
  line: number,
  cols: ReturnType<typeof buildColumnIndexes>,
  classrooms: readonly ClassroomRecord[]
): { row: StudentCsvParsedRow } | { error: string } {
  const name = normalizePasteCell(cells[cols.iName] ?? "");
  const name_kana =
    readOptionalCell(cells, cols.iNameKana).trim() || null;
  const gradeRaw = normalizePasteCell(cells[cols.iGrade] ?? "");
  const classroom = normalizePasteCell(cells[cols.iClass] ?? "");
  const initialSubjects = parseSubjectsCell(cells[cols.iSubj] ?? "");
  const note =
    cols.iNote >= 0 ? normalizePasteCell(cells[cols.iNote] ?? "") || null : null;
  const persistent_memo =
    readOptionalCell(cells, cols.iPersistentMemo).trim() || null;

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

  const portalRaw = readOptionalCell(cells, cols.iPortalId);
  let portal_id: string | null = null;
  if (portalRaw) {
    const portalResult = readPortalIdFromInput(portalRaw);
    if (portalResult.error) {
      return { error: `${line}行目: ${portalResult.error}` };
    }
    portal_id = portalResult.value;
  }

  const birthdayRaw = readOptionalCell(cells, cols.iBirthday);
  let birthday: string | null = null;
  if (birthdayRaw) {
    birthday = normalizeBirthdayMmdd(birthdayRaw);
    if (!birthday || !isValidBirthdayMmdd(birthday)) {
      return {
        error: `${line}行目: 誕生日は月日4桁で入力してください（例: 0327）。`,
      };
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

  const robotCourseText = readCourseTextCells(
    cells,
    cols.iRobotCourse,
    cols.iRobotText
  );
  const progCourseText = readCourseTextCells(
    cells,
    cols.iProgCourse,
    cols.iProgText
  );

  const subjects = inferSubjectsFromRow(
    initialSubjects,
    robot.slot,
    prog.slot,
    robotCourseText.course,
    progCourseText.course
  );

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

  const robotCourseRaw = normalizeRobotCourseName(robotCourseText.course);
  const robotTextRaw = normalizeRobotTextForCourse(
    robotCourseRaw,
    robotCourseText.text
  );
  const robotNext = resolveRobotNextTextFromCsv(
    robotCourseRaw,
    robotTextRaw,
    line
  );
  if (robotNext.error) return { error: robotNext.error };

  const progNext = readNextTextPair(
    progCourseText.course,
    progCourseText.text,
    "プログラミング",
    line,
    buildProgrammingNextTextFromParts,
    isProgrammingNextText
  );
  if (progNext.error) return { error: progNext.error };

  if (subjects.includes("ロボット") && !robotNext.combined) {
    return {
      error: `${line}行目: ロボット受講の場合、ロボット_コースとロボット_テキスト名を指定してください。`,
    };
  }
  if (subjects.includes("プログラミング") && !progNext.combined) {
    return {
      error: `${line}行目: プログラミング受講の場合、プログラミング_コースとプログラミング_テキスト名を指定してください。`,
    };
  }
  if (!subjects.includes("ロボット") && robotNext.combined) {
    return {
      error: `${line}行目: ロボットを受講していないのにロボットのテキストが指定されています。`,
    };
  }
  if (!subjects.includes("プログラミング") && progNext.combined) {
    return {
      error: `${line}行目: プログラミングを受講していないのにプログラミングのテキストが指定されています。`,
    };
  }

  const courseStartRobot = readOptionalYearMonth(
    readOptionalCell(cells, cols.iCourseStartRobot),
    "ロボット_コース開始月",
    line
  );
  if (courseStartRobot.error) return { error: courseStartRobot.error };

  const courseStartProg = readOptionalYearMonth(
    readOptionalCell(cells, cols.iCourseStartProg),
    "プログラミング_コース開始月",
    line
  );
  if (courseStartProg.error) return { error: courseStartProg.error };

  swapMisplacedCourseStartYm(subjects, courseStartRobot, courseStartProg);

  if (subjects.includes("ロボット") && !courseStartRobot.value) {
    return {
      error: `${line}行目: ロボット受講の場合、ロボット_コース開始月（YYYY-MM）を指定してください。`,
    };
  }
  if (subjects.includes("プログラミング") && !courseStartProg.value) {
    return {
      error: `${line}行目: プログラミング受講の場合、プログラミング_コース開始月（YYYY-MM）を指定してください。`,
    };
  }

  const promotionYmResult = readOptionalYearMonth(
    readOptionalCell(cells, cols.iPromotionYm),
    "飛び級予定月",
    line
  );
  if (promotionYmResult.error) return { error: promotionYmResult.error };

  const leaveFrom = readOptionalYearMonth(
    readOptionalCell(cells, cols.iLeaveFrom),
    "休会開始月",
    line
  );
  if (leaveFrom.error) return { error: leaveFrom.error };

  const leaveUntil = readOptionalYearMonth(
    readOptionalCell(cells, cols.iLeaveUntil),
    "休会終了月",
    line
  );
  if (leaveUntil.error) return { error: leaveUntil.error };

  if (
    leaveFrom.value &&
    leaveUntil.value &&
    leaveFrom.value > leaveUntil.value
  ) {
    return {
      error: `${line}行目: 休会開始月は休会終了月以前にしてください。`,
    };
  }

  const withdrawal = readOptionalYearMonth(
    readOptionalCell(cells, cols.iWithdrawal),
    "退会予定月",
    line
  );
  if (withdrawal.error) return { error: withdrawal.error };

  const scratchId =
    readOptionalCell(cells, cols.iScratchId).trim() || null;
  const scratchPass =
    readOptionalCell(cells, cols.iScratchPass).trim() || null;
  const minecraftLogin =
    readOptionalCell(cells, cols.iMinecraft).trim() || null;

  if (subjects.includes("プログラミング")) {
    if ((scratchId && !scratchPass) || (!scratchId && scratchPass)) {
      return {
        error: `${line}行目: スクラッチIDとPASSは両方指定してください。`,
      };
    }
  }

  return {
    row: {
      line,
      student_id,
      name,
      name_kana,
      grade: gradeRaw as GradeLevel,
      classroom,
      subjects,
      portal_id,
      birthday,
      robotSlot: robot.slot,
      robot_course: robotNext.course,
      robot_text: robotNext.text,
      next_text_robot: robotNext.combined,
      next_text_robot_course: robotNext.course,
      next_text_robot_text: robotNext.text,
      progSlot: prog.slot,
      prog_course: progNext.course,
      prog_text: progNext.text,
      next_text_programming: progNext.combined,
      next_text_programming_course: progNext.course,
      next_text_programming_text: progNext.text,
      course_start_robot_ym: subjects.includes("ロボット")
        ? courseStartRobot.value
        : null,
      course_start_programming_ym: subjects.includes("プログラミング")
        ? courseStartProg.value
        : null,
      promotion_scheduled_ym: promotionYmResult.value,
      promotion_type: promotionYmResult.value ? "skip_grade" : "normal",
      scratch_login_id: subjects.includes("プログラミング") ? scratchId : null,
      scratch_login_pass: subjects.includes("プログラミング")
        ? scratchPass
        : null,
      minecraft_login: subjects.includes("プログラミング")
        ? minecraftLogin
        : null,
      leave_from_ym: leaveFrom.value,
      leave_until_ym: leaveUntil.value,
      withdrawal_until_ym: withdrawal.value,
      persistent_memo,
      note,
    },
  };
}

function buildColumnIndexes(header: string[]) {
  return {
    iId: headerIndex(header, ["student_id", "id"]),
    iName: headerIndex(header, ["氏名", "name"]),
    iNameKana: headerIndex(header, ["氏名かな", "name_kana", "ふりがな"]),
    iGrade: headerIndex(header, ["学年", "grade"]),
    iClass: headerIndex(header, ["教室", "所属教室", "classroom"]),
    iSubj: headerIndex(header, ["教科", "受講教科", "subjects"]),
    iPortalId: headerIndex(header, [
      "ポータルid",
      "portal_id",
      "保護者用生徒id",
      "生徒id",
    ]),
    iBirthday: headerIndex(header, ["誕生日", "birthday"]),
    iNote: headerIndex(header, ["メモ", "note"]),
    iPersistentMemo: headerIndex(header, [
      "継続備考",
      "persistent_memo",
    ]),
    iRobotWeek: headerIndex(header, [
      "ロボット_週グループ",
      "robot_week_group",
    ]),
    iRobotDay: headerIndex(header, [
      "ロボット_曜日",
      "robot_day_of_week",
      "robot_day",
    ]),
    iRobotPeriod: headerIndex(header, ["ロボット_コマ", "robot_period"]),
    iRobotCourse: headerIndex(header, [
      "ロボット_コース",
      "robot_course",
      "next_text_robot_course",
    ]),
    iRobotText: headerIndex(header, [
      "ロボット_テキスト名",
      "robot_text",
      "next_text_robot_text",
    ]),
    iProgWeek: headerIndex(header, [
      "プログラミング_週グループ",
      "prog_week_group",
      "programming_week_group",
    ]),
    iProgDay: headerIndex(header, [
      "プログラミング_曜日",
      "prog_day_of_week",
      "programming_day_of_week",
    ]),
    iProgPeriod: headerIndex(header, [
      "プログラミング_コマ",
      "prog_period",
      "programming_period",
    ]),
    iProgCourse: headerIndex(header, [
      "プログラミング_コース",
      "prog_course",
      "programming_course",
      "next_text_programming_course",
    ]),
    iProgText: headerIndex(header, [
      "プログラミング_テキスト名",
      "prog_text",
      "programming_text",
      "next_text_programming_text",
    ]),
    iCourseStartRobot: headerIndex(header, [
      "ロボット_コース開始月",
      "course_start_robot_ym",
    ]),
    iCourseStartProg: headerIndex(header, [
      "プログラミング_コース開始月",
      "course_start_programming_ym",
    ]),
    iPromotionYm: headerIndex(header, [
      "飛び級予定月",
      "promotion_scheduled_ym",
    ]),
    iScratchId: headerIndex(header, [
      "スクラッチid",
      "scratch_login_id",
    ]),
    iScratchPass: headerIndex(header, [
      "スクラッチpass",
      "scratch_login_pass",
    ]),
    iMinecraft: headerIndex(header, [
      "マイクラログイン",
      "minecraft_login",
    ]),
    iLeaveFrom: headerIndex(header, ["休会開始月", "leave_from_ym"]),
    iLeaveUntil: headerIndex(header, ["休会終了月", "leave_until_ym"]),
    iWithdrawal: headerIndex(header, [
      "退会予定月",
      "withdrawal_until_ym",
    ]),
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

  const lines = preprocessCsvLines(text);
  if (lines.length < 1) {
    return { ok: false, error: "データ行がありません。" };
  }

  const firstCells = splitTableRow(lines[0]);
  const hasHeader = isCsvHeaderRow(firstCells);
  let cols: ReturnType<typeof buildColumnIndexes>;
  let dataStartLine = 1;

  if (hasHeader) {
    if (lines.length < 2) {
      return { ok: false, error: "ヘッダー行の下にデータ行が必要です。" };
    }
    const header = firstCells.map((s) => s.toLowerCase());
    cols = buildColumnIndexes(header);
    if (cols.iName < 0 || cols.iGrade < 0 || cols.iClass < 0 || cols.iSubj < 0) {
      return {
        ok: false,
        error:
          "必須列: 氏名(name), 学年(grade), 教室(classroom), 教科(subjects)。レギュラーコマ列も必要です。",
      };
    }
  } else {
    const offset = detectLeadingOffset(firstCells);
    if (
      offset === 0 &&
      !(GRADE_LEVELS as readonly string[]).includes(
        normalizePasteCell(firstCells[3] ?? "") as GradeLevel
      )
    ) {
      return {
        ok: false,
        error: `1行目にヘッダー行がありません。先頭に次の行を追加してから貼り付けてください:\n${STUDENT_CSV_HEADER}`,
      };
    }
    cols = buildPositionalColumnIndexes(offset);
    dataStartLine = 0;
  }

  const parsed: StudentCsvParsedRow[] = [];

  for (let r = dataStartLine; r < lines.length; r++) {
    const cells = splitTableRow(lines[r]);
    const nonEmpty = cells.filter((c) => c.trim()).length;
    if (nonEmpty < 5) continue;

    const nameProbe = normalizePasteCell(cells[cols.iName] ?? "").trim();
    if (!nameProbe) continue;

    const result = parseDataRow(cells, r + 1, cols, classrooms);
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

export function studentCsvRowToPayload(
  row: StudentCsvRow,
  slots: { robotCapacityId: string | null; progCapacityId: string | null }
) {
  return {
    name: row.name,
    name_kana: row.name_kana,
    grade: row.grade,
    classroom: row.classroom,
    subjects: row.subjects,
    portal_id: row.portal_id,
    birthday: row.birthday,
    enrollment_robot_capacity_id: slots.robotCapacityId,
    enrollment_prog_capacity_id: slots.progCapacityId,
    next_text_robot: row.next_text_robot,
    next_text_robot_course: row.next_text_robot_course,
    next_text_robot_text: row.next_text_robot_text,
    next_text_programming: row.next_text_programming,
    next_text_programming_course: row.next_text_programming_course,
    next_text_programming_text: row.next_text_programming_text,
    course_start_robot_ym: row.course_start_robot_ym,
    course_start_programming_ym: row.course_start_programming_ym,
    promotion_scheduled_ym: row.promotion_scheduled_ym,
    promotion_type: row.promotion_type,
    scratch_login_id: row.scratch_login_id,
    scratch_login_pass: row.scratch_login_pass,
    minecraft_login: row.minecraft_login,
    leave_from_ym: row.leave_from_ym,
    leave_until_ym: row.leave_until_ym,
    withdrawal_until_ym: row.withdrawal_until_ym,
    persistent_memo: row.persistent_memo,
    note: row.note,
  };
}

/** ヘッダー例（ドキュメント・サンプル用） */
export const STUDENT_CSV_HEADER =
  "student_id,氏名,氏名かな,学年,教室,教科,ポータルID,誕生日,ロボット_週グループ,ロボット_曜日,ロボット_コマ,ロボット_コース,ロボット_テキスト名,プログラミング_週グループ,プログラミング_曜日,プログラミング_コマ,プログラミング_コース,プログラミング_テキスト名,ロボット_コース開始月,プログラミング_コース開始月,飛び級予定月,スクラッチID,スクラッチPASS,マイクラログイン,休会開始月,休会終了月,退会予定月,継続備考,メモ";

export { parseWeekGroupCell, parseDayOfWeekCell, parsePeriodCell };
