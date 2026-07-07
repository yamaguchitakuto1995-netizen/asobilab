import { describe, expect, it } from "vitest";
import { dedupeScheduledLessonsBySlot } from "./scheduledLessonDedupe";

describe("dedupeScheduledLessonsBySlot", () => {
  it("keeps one row per student/date/period/subject", () => {
    const rows = dedupeScheduledLessonsBySlot([
      {
        id: "a",
        student_id: "s1",
        lesson_date: "2026-09-11",
        period: 1,
        subject: "プログラミング",
        status: "scheduled",
      },
      {
        id: "b",
        student_id: "s1",
        lesson_date: "2026-09-11",
        period: 1,
        subject: "プログラミング",
        status: "scheduled",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("a");
  });

  it("prefers recorded over scheduled", () => {
    const rows = dedupeScheduledLessonsBySlot([
      {
        id: "scheduled",
        student_id: "s1",
        lesson_date: "2026-09-11",
        period: 1,
        subject: "プログラミング",
        status: "scheduled",
      },
      {
        id: "recorded",
        student_id: "s1",
        lesson_date: "2026-09-11",
        period: 1,
        subject: "プログラミング",
        status: "recorded",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("recorded");
  });
});
