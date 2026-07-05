import {
  resolvePromotionScheduleLabel,
  type PromotionStudentFields,
} from "@/lib/studentPromotion";

type Props = {
  subject?: string | null;
  student?: PromotionStudentFields | null;
  compact?: boolean;
};

export function PromotionScheduleNotice({
  subject,
  student,
  compact = false,
}: Props) {
  const label = resolvePromotionScheduleLabel(subject, student);
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
  subjects,
  student,
}: {
  subjects?: string[] | null;
  student: PromotionStudentFields;
}) {
  const targets = (subjects ?? []).filter(
    (s) => s === "ロボット" || s === "プログラミング"
  );
  if (targets.length === 0) return null;

  const notices = targets.flatMap((subject) => {
    const label = resolvePromotionScheduleLabel(subject, student);
    return label ? [{ subject, label }] : [];
  });

  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map(({ subject, label }) => (
        <p
          key={subject}
          className="text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2"
        >
          {label}
        </p>
      ))}
    </div>
  );
}
