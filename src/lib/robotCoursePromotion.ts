import { currentYm, shiftMonth } from "@/lib/date";
import { resolveCourseStartYm } from "@/lib/studentCourseStart";
import {
  parseRobotNextTextParts,
  resolveRobotNextTextPartsForStudent,
  ROBOT_NEXT_TEXT_OPTIONS,
} from "@/lib/courseNextText";

export type RobotPromotionStudentFields = {
  course_start_robot_ym?: string | null;
  next_text_robot?: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
};

/** 月2回ペース */
const LESSONS_PER_MONTH = 2;

/** ロボット各コースのコース名（courseNextText と一致） */
export const ROBOT_COURSE_STARTUP = "スタートアップ（入会時）";
export const ROBOT_COURSE_PREP = "プレプライマリー";
export const ROBOT_COURSE_PRIM = "プライマリー";
export const ROBOT_COURSE_BASIC = "ベーシック（2周）";
export const ROBOT_COURSE_MIDDLE = "ミドル（2周）";
export const ROBOT_COURSE_ADV = "アドバンス（2周）";

const ENTRY_SU_TEXTS = ROBOT_NEXT_TEXT_OPTIONS.filter((opt) => {
  const p = parseRobotNextTextParts(opt);
  return p?.course === ROBOT_COURSE_STARTUP;
});

function textsForRobotCourse(course: string): string[] {
  return ROBOT_NEXT_TEXT_OPTIONS.filter((opt) => {
    const p = parseRobotNextTextParts(opt);
    return p?.course === course;
  });
}

function isRobotStartupSuText(full: string | null | undefined): boolean {
  if (!full?.trim()) return false;
  const p = parseRobotNextTextParts(full);
  return p?.course === ROBOT_COURSE_STARTUP;
}

/**
 * 進級タイミング算出用の授業並び。
 * - プレプライマリー入会: スタートアップSU + 教材12か月
 * - プライマリー・ベーシック進級時: SUなし
 * - ミドル・アドバンス: SU必須（カリキュラム先頭にSU）
 * - プライマリー・ベーシック入会時: 入会月にSU → 先頭にSUを付与
 */
export function robotPromotionLessonSequence(
  student: RobotPromotionStudentFields
): { course: string; sequence: string[] } | null {
  const parts = resolveRobotNextTextPartsForStudent(student);
  if (!parts?.full || !parts.course) return null;

  let course = parts.course;
  if (course === ROBOT_COURSE_STARTUP) {
    course = ROBOT_COURSE_PREP;
  }

  if (course === ROBOT_COURSE_STARTUP) {
    return { course, sequence: textsForRobotCourse(ROBOT_COURSE_STARTUP) };
  }

  if (course === ROBOT_COURSE_PREP) {
    return {
      course,
      sequence: [...ENTRY_SU_TEXTS, ...textsForRobotCourse(ROBOT_COURSE_PREP)],
    };
  }

  if (course === ROBOT_COURSE_PRIM) {
    const withEntrySu = isRobotStartupSuText(parts.full);
    const prim = textsForRobotCourse(ROBOT_COURSE_PRIM);
    return {
      course,
      sequence: withEntrySu ? [...ENTRY_SU_TEXTS, ...prim] : prim,
    };
  }

  if (course === ROBOT_COURSE_BASIC) {
    const withEntrySu = isRobotStartupSuText(parts.full);
    const basic = textsForRobotCourse(ROBOT_COURSE_BASIC);
    return {
      course,
      sequence: withEntrySu ? [...ENTRY_SU_TEXTS, ...basic] : basic,
    };
  }

  if (course === ROBOT_COURSE_MIDDLE || course === ROBOT_COURSE_ADV) {
    return { course, sequence: textsForRobotCourse(course) };
  }

  return null;
}

/** 現在地から進級までの残り月数（表示用） */
export function robotRemainingMonthsInCourse(
  student: RobotPromotionStudentFields
): number | null {
  const parts = resolveRobotNextTextPartsForStudent(student);
  const built = robotPromotionLessonSequence(student);
  if (!parts?.full || !built) return null;

  const idx = built.sequence.indexOf(parts.full);
  if (idx === -1) return null;

  return Math.ceil((built.sequence.length - idx) / LESSONS_PER_MONTH);
}

/** 現在地から進級予定月までの月数（コース開始月起点） */
export function robotMonthsUntilPromotionFromCourseStart(
  student: RobotPromotionStudentFields
): number | null {
  const parts = resolveRobotNextTextPartsForStudent(student);
  const built = robotPromotionLessonSequence(student);
  if (!parts?.full || !built) return null;

  const idx = built.sequence.indexOf(parts.full);
  if (idx === -1) return null;

  const len = built.sequence.length;
  const elapsedMonths = Math.floor(idx / LESSONS_PER_MONTH);
  const remainingMonths = Math.ceil((len - idx) / LESSONS_PER_MONTH);
  return elapsedMonths + remainingMonths;
}

/** ロボットの自動進級予定月（コース開始月 + コース進行ルール） */
export function estimateRobotAutoPromotionScheduledYm(
  student: RobotPromotionStudentFields
): string | null {
  const courseStartYm =
    resolveCourseStartYm("ロボット", student) ?? currentYm();

  const months = robotMonthsUntilPromotionFromCourseStart(student);
  if (months == null || months <= 0) return null;

  return shiftMonth(courseStartYm, months);
}

/** コース全体の月数（表示用） */
export function robotTotalMonthsInCurrentCoursePeriod(
  student: RobotPromotionStudentFields
): number | null {
  const built = robotPromotionLessonSequence(student);
  if (!built) return null;
  return Math.ceil(built.sequence.length / LESSONS_PER_MONTH);
}
