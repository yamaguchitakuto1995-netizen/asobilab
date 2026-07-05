import {
  formatPromotionScheduleLabel,
  resolveNextPromotionCourseDisplay,
  type PromotionStudentFields,
  type PromotionType,
} from "@/lib/studentPromotion";

type Props = {
  promotionScheduledYm?: string | null;
  promotionType?: PromotionType | string | null;
  subject?: string | null;
  student?: PromotionStudentFields | null;
  compact?: boolean;
};

export function PromotionScheduleNotice({
  promotionScheduledYm,
  promotionType,
  subject,
  student,
  compact = false,
}: Props) {
  const nextCourse = resolveNextPromotionCourseDisplay(subject, student);
  const label = formatPromotionScheduleLabel(
    promotionScheduledYm,
    promotionType,
    nextCourse
  );
  if (!label) return null;

  return (
    <p
      className={
        compact
          ? "text-center text-[10px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5"
          : "text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
      }
    >
      {label}
    </p>
  );
}

/** 受講教科ごとに進級予定を表示（生徒情報ページ用） */
export function StudentPromotionScheduleNotices({
  promotionScheduledYm,
  promotionType,
  subjects,
  student,
}: {
  promotionScheduledYm?: string | null;
  promotionType?: PromotionType | string | null;
  subjects?: string[] | null;
  student: PromotionStudentFields;
}) {
  if (!promotionScheduledYm?.trim()) return null;

  const targets = (subjects ?? []).filter(
    (s) => s === "ロボット" || s === "プログラミング"
  );
  if (targets.length === 0) return null;

  return (
    <div className="space-y-2">
      {targets.map((subject) => (
        <PromotionScheduleNotice
          key={subject}
          promotionScheduledYm={promotionScheduledYm}
          promotionType={promotionType}
          subject={subject}
          student={student}
        />
      ))}
    </div>
  );
}
