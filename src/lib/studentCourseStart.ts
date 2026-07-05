import type { CourseSubject } from "@/lib/types";
import { isValidYearMonth } from "@/lib/studentWithdrawal";
import type { PromotionStudentFields } from "@/lib/studentPromotion";

export type CourseStartFields = {
  course_start_robot_ym?: string | null;
  course_start_programming_ym?: string | null;
};

export function resolveCourseStartYm(
  subject: string | null | undefined,
  student: (PromotionStudentFields & CourseStartFields) | null | undefined
): string | null {
  if (!student || !subject) return null;
  if (subject === "ロボット") return student.course_start_robot_ym?.trim() || null;
  if (subject === "プログラミング") {
    return student.course_start_programming_ym?.trim() || null;
  }
  return null;
}

export function courseStartColumnForSubject(
  subject: "ロボット" | "プログラミング"
): "course_start_robot_ym" | "course_start_programming_ym" {
  return subject === "ロボット"
    ? "course_start_robot_ym"
    : "course_start_programming_ym";
}

export function readCourseStartFromForm(
  formData: FormData,
  subjects: CourseSubject[]
): {
  course_start_robot_ym: string | null;
  course_start_programming_ym: string | null;
  error?: string;
} {
  const robotYm = String(formData.get("course_start_robot_ym") ?? "").trim();
  const progYm = String(
    formData.get("course_start_programming_ym") ?? ""
  ).trim();

  if (subjects.includes("ロボット")) {
    if (!robotYm) {
      return {
        course_start_robot_ym: null,
        course_start_programming_ym: null,
        error: "ロボット受講の場合、コース開始月を入力してください。",
      };
    }
    if (!isValidYearMonth(robotYm)) {
      return {
        course_start_robot_ym: null,
        course_start_programming_ym: null,
        error: "ロボットのコース開始月の形式が不正です（YYYY-MM）。",
      };
    }
  }

  if (subjects.includes("プログラミング")) {
    if (!progYm) {
      return {
        course_start_robot_ym: null,
        course_start_programming_ym: null,
        error:
          "プログラミング受講の場合、コース開始月を入力してください。",
      };
    }
    if (!isValidYearMonth(progYm)) {
      return {
        course_start_robot_ym: null,
        course_start_programming_ym: null,
        error:
          "プログラミングのコース開始月の形式が不正です（YYYY-MM）。",
      };
    }
  }

  return {
    course_start_robot_ym: subjects.includes("ロボット") ? robotYm : null,
    course_start_programming_ym: subjects.includes("プログラミング")
      ? progYm
      : null,
  };
}
