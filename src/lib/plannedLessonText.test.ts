import { describe, expect, it } from "vitest";
import {
  countPriorAdvancingScheduledLessons,
  plannedTextForScheduledLesson,
  type ScheduledLessonForPlanning,
} from "./plannedLessonText";

const student = {
  next_text_robot: null,
  next_text_programming: "ベーシック / 7-1",
  next_text_programming_course: "ベーシック",
  next_text_programming_text: "7-1",
};

function upcoming(rows: ScheduledLessonForPlanning[]): ScheduledLessonForPlanning[] {
  return rows;
}

describe("plannedTextForScheduledLesson", () => {
  it("advances when an earlier scheduled present lesson exists", () => {
    const list = upcoming([
      {
        id: "a",
        lesson_date: "2026-07-11",
        period: 3,
        subject: "プログラミング",
        attendance: "present",
        status: "scheduled",
      },
      {
        id: "b",
        lesson_date: "2026-07-18",
        period: 3,
        subject: "プログラミング",
        attendance: "present",
        status: "scheduled",
      },
    ]);

    expect(
      plannedTextForScheduledLesson(
        {
          id: "a",
          lesson_date: "2026-07-11",
          period: 3,
          subject: "プログラミング",
          status: "scheduled",
          attendance: "present",
        },
        student,
        list
      )
    ).toBe("ベーシック / 7-1");

    expect(
      plannedTextForScheduledLesson(
        {
          id: "b",
          lesson_date: "2026-07-18",
          period: 3,
          subject: "プログラミング",
          status: "scheduled",
          attendance: "present",
        },
        student,
        list
      )
    ).toBe("ベーシック / 7-2");
  });

  it("does not advance past absent scheduled lesson", () => {
    const list = upcoming([
      {
        id: "a",
        lesson_date: "2026-07-11",
        period: 3,
        subject: "プログラミング",
        attendance: "absent",
        status: "scheduled",
      },
      {
        id: "b",
        lesson_date: "2026-07-18",
        period: 3,
        subject: "プログラミング",
        attendance: "present",
        status: "scheduled",
      },
    ]);

    expect(
      plannedTextForScheduledLesson(
        {
          id: "b",
          lesson_date: "2026-07-18",
          period: 3,
          subject: "プログラミング",
          status: "scheduled",
          attendance: "present",
        },
        student,
        list
      )
    ).toBe("ベーシック / 7-1");
  });

  it("counts makeup before later regular lesson", () => {
    const list = upcoming([
      {
        id: "a",
        lesson_date: "2026-07-11",
        period: 3,
        subject: "プログラミング",
        attendance: "absent",
        status: "scheduled",
      },
      {
        id: "m",
        lesson_date: "2026-07-15",
        period: 2,
        subject: "プログラミング",
        attendance: "makeup",
        status: "scheduled",
      },
      {
        id: "b",
        lesson_date: "2026-07-18",
        period: 3,
        subject: "プログラミング",
        attendance: "present",
        status: "scheduled",
      },
    ]);

    expect(
      plannedTextForScheduledLesson(
        {
          id: "m",
          lesson_date: "2026-07-15",
          period: 2,
          subject: "プログラミング",
          status: "scheduled",
          attendance: "makeup",
        },
        student,
        list
      )
    ).toBe("ベーシック / 7-1");

    expect(
      plannedTextForScheduledLesson(
        {
          id: "b",
          lesson_date: "2026-07-18",
          period: 3,
          subject: "プログラミング",
          status: "scheduled",
          attendance: "present",
        },
        student,
        list
      )
    ).toBe("ベーシック / 7-2");
  });
});

describe("countPriorAdvancingScheduledLessons", () => {
  it("ignores same lesson id", () => {
    const count = countPriorAdvancingScheduledLessons(
      [
        {
          id: "x",
          lesson_date: "2026-07-18",
          period: 3,
          subject: "プログラミング",
          attendance: "present",
          status: "scheduled",
        },
      ],
      {
        id: "x",
        lesson_date: "2026-07-18",
        period: 3,
        subject: "プログラミング",
      },
      "プログラミング"
    );
    expect(count).toBe(0);
  });
});
