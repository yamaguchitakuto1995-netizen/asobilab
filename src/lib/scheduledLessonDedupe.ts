/** 同一生徒・日付・コマ・教科の scheduled 行キー */
export function scheduledLessonSlotKey(lesson: {
  student_id?: string;
  lesson_date: string;
  period: number | null;
  subject: string | null;
}): string {
  return `${lesson.student_id ?? ""}|${lesson.lesson_date}|${lesson.period ?? ""}|${lesson.subject ?? ""}`;
}

/**
 * 同一コマの重複 scheduled 行を1件にまとめる。
 * 記録済みがあれば scheduled より優先（日次ボードと同じ方針）。
 */
export function dedupeScheduledLessonsBySlot<
  T extends {
    id: string;
    lesson_date: string;
    period: number | null;
    subject: string | null;
    status?: string;
    student_id?: string;
  },
>(lessons: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const lesson of lessons) {
    const key = scheduledLessonSlotKey(lesson);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, lesson);
      continue;
    }
    if (existing.status === "scheduled" && lesson.status === "recorded") {
      byKey.set(key, lesson);
    }
  }
  return Array.from(byKey.values());
}
