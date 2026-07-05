import {
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";

type StudentTextFields = {
  next_text_robot: string | null;
  next_text_programming: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

export type LessonLikeForInventory = {
  status: string;
  attendance?: string | null;
  subject: string | null;
  textbook: string | null;
  students: (StudentTextFields & { id?: string }) | null;
};

/** コマ表の教材集計から除外する行（欠席予定など） */
export function countsTowardTextbookInventory(
  lesson: Pick<LessonLikeForInventory, "status" | "attendance">
): boolean {
  return !(lesson.status === "scheduled" && (lesson.attendance === "absent" || lesson.attendance === "on_leave"));
}

/**
 * コマ表の「教材が何種類・何冊必要か」集計用の表示ラベル。
 * - 記録済みで textbook が入っていればそれを優先
 * - 予定などで空なら、科目に応じて生徒の次回テキストから復元
 */
export function lessonTextbookInventoryLabel(
  lesson: LessonLikeForInventory
): string {
  const tb = lesson.textbook?.trim();
  if (tb) return tb;

  const st = lesson.students;
  const subj = lesson.subject?.trim() || "";

  if (subj === "ロボット" && st) {
    const r = resolveRobotNextTextPartsForStudent({
      next_text_robot: st.next_text_robot,
      next_text_robot_course: st.next_text_robot_course,
      next_text_robot_text: st.next_text_robot_text,
    });
    if (r?.course?.trim() && r?.text?.trim()) {
      return `${r.course.trim()} · ${r.text.trim()}（ロボット）`;
    }
    return "ロボット：次回テキスト未設定";
  }

  if (subj === "プログラミング" && st) {
    const r = resolveProgrammingNextTextPartsForStudent({
      next_text_programming: st.next_text_programming,
      next_text_programming_course: st.next_text_programming_course,
      next_text_programming_text: st.next_text_programming_text,
    });
    if (r?.course?.trim() && r?.text?.trim()) {
      return `${r.course.trim()} · ${r.text.trim()}（プログラミング）`;
    }
    return "プログラミング：次回テキスト未設定";
  }

  if (subj) return `（${subj}）教材未登録`;
  return "科目未設定・教材不明";
}

export function aggregateLessonTextbookCounts(
  lessons: LessonLikeForInventory[]
): { label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const l of lessons) {
    if (!countsTowardTextbookInventory(l)) continue;
    const key = lessonTextbookInventoryLabel(l);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort(
      (a, b) =>
        b.count - a.count || a.label.localeCompare(b.label, "ja", { sensitivity: "base" })
    );
}
