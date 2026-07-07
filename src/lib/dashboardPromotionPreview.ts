import { currentYm, shiftMonth } from "@/lib/date";
import {
  resolveNextPromotionCourseDisplay,
  resolvePromotionScheduleInfo,
  type PromotionStudentFields,
} from "@/lib/studentPromotion";
import type { CourseSubject } from "@/lib/types";

export type DashboardPromotionEntry = {
  studentId: string;
  studentName: string;
  subject: CourseSubject;
  courseLabel: string;
  promotionKindLabel: string;
};

export type DashboardPromotionPreview = {
  targetYm: string;
  monthLabel: string;
  entries: DashboardPromotionEntry[];
};

const PROMOTION_SUBJECTS: CourseSubject[] = ["ロボット", "プログラミング"];

function formatPromotionTargetCourseLabel(
  promotionScheduledYm: string,
  nextCourse: string
): string {
  const month = Number(promotionScheduledYm.slice(5, 7));
  return `${month}月から${nextCourse}`;
}

function promotionKindLabel(promotionType: string): string {
  return promotionType === "skip_grade" ? "飛び級進級" : "自動進級";
}

type StudentRow = PromotionStudentFields & {
  id: string;
  name: string;
  subjects: string[] | null;
};

/** 来月コース進級予定の一覧（管理者ダッシュボード用） */
export function buildNextMonthPromotionPreview(
  students: StudentRow[],
  nowYm: string = currentYm()
): DashboardPromotionPreview {
  const targetYm = shiftMonth(nowYm, 1);
  const monthNum = Number(targetYm.slice(5, 7));
  const entries: DashboardPromotionEntry[] = [];

  for (const student of students) {
    const enrolled = (student.subjects ?? []).filter((s): s is CourseSubject =>
      PROMOTION_SUBJECTS.includes(s as CourseSubject)
    );

    for (const subject of enrolled) {
      const info = resolvePromotionScheduleInfo(subject, student, nowYm);
      if (!info || info.promotionScheduledYm !== targetYm) continue;

      const nextCourse = resolveNextPromotionCourseDisplay(subject, student);
      if (!nextCourse) continue;

      entries.push({
        studentId: student.id,
        studentName: student.name,
        subject,
        courseLabel: formatPromotionTargetCourseLabel(
          info.promotionScheduledYm,
          nextCourse
        ),
        promotionKindLabel: promotionKindLabel(info.promotionType),
      });
    }
  }

  entries.sort((a, b) => {
    const subjectCmp = a.subject.localeCompare(b.subject, "ja");
    if (subjectCmp !== 0) return subjectCmp;
    return a.studentName.localeCompare(b.studentName, "ja");
  });

  return {
    targetYm,
    monthLabel: `${monthNum}月進級予定者`,
    entries,
  };
}
