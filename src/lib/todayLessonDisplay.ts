import {
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";
import {
  ATTENDANCE_LABEL,
  SCHEDULED_ATTENDANCE_LABEL,
  type AttendanceStatus,
  type Lesson,
} from "@/lib/types";

type StudentTextFields = {
  next_text_robot: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

/** コマ表の出欠表示（予定 / 記録済みでラベルを切り替え） */
export function lessonAttendanceDisplayLabel(
  lesson: Pick<Lesson, "status" | "attendance">
): string {
  if (lesson.status === "scheduled") {
    return SCHEDULED_ATTENDANCE_LABEL[lesson.attendance];
  }
  return ATTENDANCE_LABEL[lesson.attendance];
}

/** 本日のテキスト（記録済みは textbook、予定は次回テキストから推定） */
export function lessonTodayTextLabel(
  lesson: Pick<Lesson, "textbook" | "subject" | "status">,
  student: StudentTextFields | null | undefined
): string {
  const tb = lesson.textbook?.trim();
  if (tb) return tb;

  if (!student || !lesson.subject) return "—";

  if (lesson.subject === "ロボット") {
    const r = resolveRobotNextTextPartsForStudent({
      next_text_robot: student.next_text_robot,
      next_text_robot_course: student.next_text_robot_course,
      next_text_robot_text: student.next_text_robot_text,
    });
    return r?.full ?? "—";
  }

  if (lesson.subject === "プログラミング") {
    const r = resolveProgrammingNextTextPartsForStudent({
      next_text_programming: student.next_text_programming,
      next_text_programming_course: student.next_text_programming_course,
      next_text_programming_text: student.next_text_programming_text,
    });
    return r?.full ?? "—";
  }

  return "—";
}

export const DAILY_CONFIRM_ATTENDANCE_OPTIONS: {
  value: AttendanceStatus;
  label: string;
}[] = [
  { value: "present", label: "出席" },
  { value: "late", label: "遅刻" },
  { value: "absent", label: "欠席" },
  { value: "makeup", label: "振替" },
];
