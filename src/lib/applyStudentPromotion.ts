import type { SupabaseClient } from "@supabase/supabase-js";
import { currentYm } from "@/lib/date";
import {
  firstCombinedTextOfNextCourse,
  programmingNextTextStudentColumnsFromCombined,
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
  robotNextTextStudentColumnsFromCombined,
} from "@/lib/courseNextText";
import { courseStartColumnForSubject } from "@/lib/studentCourseStart";
import type { CourseSubject } from "@/lib/types";

type PromotionStudentRow = {
  id: string;
  subjects?: CourseSubject[] | null;
  promotion_scheduled_ym?: string | null;
  promotion_type?: string | null;
  next_text_robot?: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
  course_start_robot_ym?: string | null;
  course_start_programming_ym?: string | null;
};

const PROMOTION_SUBJECTS = ["ロボット", "プログラミング"] as const;

function isPromotionSubject(
  subject: string | null | undefined
): subject is (typeof PROMOTION_SUBJECTS)[number] {
  return subject === "ロボット" || subject === "プログラミング";
}

/** 自動進級（コース境界通過）時にコース開始月を更新 */
export async function updateCourseStartOnAutoPromotion(
  supabase: SupabaseClient,
  studentId: string,
  subject: "ロボット" | "プログラミング",
  promotionYm: string
): Promise<void> {
  const column = courseStartColumnForSubject(subject);
  await supabase
    .from("students")
    .update({ [column]: promotionYm })
    .eq("id", studentId);
}

/**
 * 飛び級予定月に達していれば進級を適用する。
 * 次コース先頭へジャンプし、コース開始月を更新して飛び級設定を解除する。
 */
export async function applyDueSkipPromotionIfNeeded(
  supabase: SupabaseClient,
  studentId: string,
  nowYm: string = currentYm()
): Promise<{ applied: boolean; error?: string }> {
  const { data: student, error: fetchError } = await supabase
    .from("students")
    .select(
      "id, subjects, promotion_scheduled_ym, promotion_type, next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text, course_start_robot_ym, course_start_programming_ym"
    )
    .eq("id", studentId)
    .maybeSingle<PromotionStudentRow>();

  if (fetchError) return { applied: false, error: fetchError.message };
  if (!student) return { applied: false };

  const skipYm = student.promotion_scheduled_ym?.trim();
  if (
    student.promotion_type !== "skip_grade" ||
    !skipYm ||
    nowYm < skipYm
  ) {
    return { applied: false };
  }

  const subjects = (student.subjects ?? []).filter(isPromotionSubject);
  if (subjects.length === 0) return { applied: false };

  const update: Record<string, string | null> = {
    promotion_scheduled_ym: null,
    promotion_type: "normal",
  };

  let promoted = false;

  for (const subject of subjects) {
    const jumpTo = firstCombinedTextOfNextCourse(subject, student);
    if (!jumpTo) continue;

    const column = courseStartColumnForSubject(subject);
    update[column] = skipYm;
    promoted = true;

    if (subject === "ロボット") {
      Object.assign(update, robotNextTextStudentColumnsFromCombined(jumpTo));
    } else {
      Object.assign(
        update,
        programmingNextTextStudentColumnsFromCombined(jumpTo)
      );
    }
  }

  if (!promoted) return { applied: false };

  const { error: updateError } = await supabase
    .from("students")
    .update(update)
    .eq("id", studentId);

  if (updateError) return { applied: false, error: updateError.message };
  return { applied: true };
}

/** 手動でコースが変わったとき、コース開始月を今月にリセット（未設定時のみ） */
export function shouldResetCourseStartOnManualCourseChange(
  subject: "ロボット" | "プログラミング",
  before: PromotionStudentRow,
  afterCourse: string | null
): boolean {
  if (!afterCourse) return false;

  const prevParts =
    subject === "ロボット"
      ? resolveRobotNextTextPartsForStudent(before)
      : resolveProgrammingNextTextPartsForStudent(before);

  if (!prevParts?.course || prevParts.course === afterCourse) return false;

  const column = courseStartColumnForSubject(subject);
  return !before[column]?.trim();
}
