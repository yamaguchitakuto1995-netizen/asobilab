import { currentYm, shiftMonth } from "@/lib/date";
import { resolveCourseStartYm } from "@/lib/studentCourseStart";
import {
  parseProgrammingNextTextParts,
  PROGRAMMING_NEXT_TEXT_OPTIONS,
  resolveProgrammingNextTextPartsForStudent,
} from "@/lib/courseNextText";

export type ProgrammingPromotionStudentFields = {
  course_start_programming_ym?: string | null;
  next_text_programming?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

/** 月2回ペース */
const LESSONS_PER_MONTH = 2;

export const PROG_COURSE_STARTUP = "スタートアップ（入会時）";
export const PROG_COURSE_BAS = "ベーシック";
export const PROG_COURSE_BAS2 = "ベーシック2";
export const PROG_COURSE_MID = "ミドル";
export const PROG_COURSE_MID2 = "ミドル2";
export const PROG_COURSE_ADV = "アドバンス";

const ENTRY_SU_TEXTS = PROGRAMMING_NEXT_TEXT_OPTIONS.filter((opt) => {
  const p = parseProgrammingNextTextParts(opt);
  return p?.course === PROG_COURSE_STARTUP;
});

function textsForProgrammingCourse(course: string): string[] {
  return PROGRAMMING_NEXT_TEXT_OPTIONS.filter((opt) => {
    const p = parseProgrammingNextTextParts(opt);
    return p?.course === course;
  });
}

function isProgrammingStartupSuText(full: string | null | undefined): boolean {
  if (!full?.trim()) return false;
  const p = parseProgrammingNextTextParts(full);
  return p?.course === PROG_COURSE_STARTUP;
}

/**
 * 進級タイミング算出用の授業並び。
 * - ベーシック: SU必須13か月（入会時はスタートアップSU + 教材12か月）
 * - ベーシック2 / ミドル2 / アドバンス: SU必須13か月（カリキュラムにSUあり）
 * - ミドル: SUなし12か月
 */
export function programmingPromotionLessonSequence(
  student: ProgrammingPromotionStudentFields
): { course: string; sequence: string[] } | null {
  const parts = resolveProgrammingNextTextPartsForStudent(student);
  if (!parts?.full || !parts.course) return null;

  let course = parts.course;
  if (course === PROG_COURSE_STARTUP) {
    course = PROG_COURSE_BAS;
  }

  if (course === PROG_COURSE_STARTUP) {
    return { course, sequence: textsForProgrammingCourse(PROG_COURSE_STARTUP) };
  }

  if (course === PROG_COURSE_BAS) {
    const withEntrySu = isProgrammingStartupSuText(parts.full);
    const bas = textsForProgrammingCourse(PROG_COURSE_BAS);
    return {
      course,
      sequence: withEntrySu ? [...ENTRY_SU_TEXTS, ...bas] : bas,
    };
  }

  if (
    course === PROG_COURSE_BAS2 ||
    course === PROG_COURSE_MID2 ||
    course === PROG_COURSE_ADV
  ) {
    return { course, sequence: textsForProgrammingCourse(course) };
  }

  if (course === PROG_COURSE_MID) {
    return { course, sequence: textsForProgrammingCourse(PROG_COURSE_MID) };
  }

  return null;
}

/** 現在地から進級までの残り月数（表示用） */
export function programmingRemainingMonthsInCourse(
  student: ProgrammingPromotionStudentFields
): number | null {
  const parts = resolveProgrammingNextTextPartsForStudent(student);
  const built = programmingPromotionLessonSequence(student);
  if (!parts?.full || !built) return null;

  const idx = built.sequence.indexOf(parts.full);
  if (idx === -1) return null;

  return Math.ceil((built.sequence.length - idx) / LESSONS_PER_MONTH);
}

/** 現在地から進級予定月までの月数（コース開始月起点） */
export function programmingMonthsUntilPromotionFromCourseStart(
  student: ProgrammingPromotionStudentFields
): number | null {
  const parts = resolveProgrammingNextTextPartsForStudent(student);
  const built = programmingPromotionLessonSequence(student);
  if (!parts?.full || !built) return null;

  const idx = built.sequence.indexOf(parts.full);
  if (idx === -1) return null;

  const len = built.sequence.length;
  const elapsedMonths = Math.floor(idx / LESSONS_PER_MONTH);
  const remainingMonths = Math.ceil((len - idx) / LESSONS_PER_MONTH);
  return elapsedMonths + remainingMonths;
}

/** プログラミングの自動進級予定月 */
export function estimateProgrammingAutoPromotionScheduledYm(
  student: ProgrammingPromotionStudentFields
): string | null {
  const courseStartYm =
    resolveCourseStartYm("プログラミング", student) ?? currentYm();

  const months = programmingMonthsUntilPromotionFromCourseStart(student);
  if (months == null || months <= 0) return null;

  return shiftMonth(courseStartYm, months);
}
