import {
  resolvePromotionScheduleInfo,
  type PromotionStudentFields,
} from "@/lib/studentPromotion";

type Props = {
  subject?: string | null;
  student?: PromotionStudentFields | null;
  compact?: boolean;
};

function promotionNoticeClassName(highlight: boolean, compact: boolean): string {
  if (highlight) {
    return compact
      ? "text-center text-[10px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5"
      : "text-sm font-semibold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2";
  }
  return compact
    ? "text-center text-[10px] font-medium text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5"
    : "text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2";
}

export function PromotionScheduleNotice({
  subject,
  student,
  compact = false,
}: Props) {
  const info = resolvePromotionScheduleInfo(subject, student);
  if (!info) return null;

  return (
    <p className={promotionNoticeClassName(info.highlight, compact)}>
      {info.label}
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
    const info = resolvePromotionScheduleInfo(subject, student);
    return info ? [{ subject, info }] : [];
  });

  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map(({ subject, info }) => (
        <p
          key={subject}
          className={promotionNoticeClassName(info.highlight, false)}
        >
          {info.label}
        </p>
      ))}
    </div>
  );
}
