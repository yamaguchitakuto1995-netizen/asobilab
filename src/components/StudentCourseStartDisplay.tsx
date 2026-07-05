import {
  estimateMonthsUntilCourseEnd,
  resolveNextPromotionCourseDisplay,
  type PromotionStudentFields,
} from "@/lib/studentPromotion";
import { resolveCourseStartYm } from "@/lib/studentCourseStart";
import { formatYearMonthJa } from "@/lib/studentLeave";

type Props = {
  subjects?: string[] | null;
  student: PromotionStudentFields;
  editHref?: string;
};

/** コース開始月と進級予定の概要（生徒詳細用） */
export function StudentCourseStartDisplay({
  subjects,
  student,
  editHref,
}: Props) {
  const targets = (subjects ?? []).filter(
    (s) => s === "ロボット" || s === "プログラミング"
  );
  if (targets.length === 0) return null;

  const rows = targets.flatMap((subject) => {
    const courseStart = resolveCourseStartYm(subject, student);
    const months = estimateMonthsUntilCourseEnd(subject, student);
    const nextCourse = resolveNextPromotionCourseDisplay(subject, student);
    if (!courseStart && !nextCourse) return [];

    return [
      {
        subject,
        courseStart,
        months,
        nextCourse,
      },
    ];
  });

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3 space-y-3">
      <h2 className="text-sm font-semibold text-emerald-950">コース開始・進級予定</h2>
      <ul className="space-y-2 text-sm text-slate-800">
        {rows.map((row) => (
          <li
            key={row.subject}
            className="rounded-lg bg-white/80 border border-emerald-100 px-3 py-2"
          >
            <p className="text-xs font-semibold text-emerald-900">{row.subject}</p>
            {row.courseStart ? (
              <p className="mt-1 text-sm">
                コース開始: {formatYearMonthJa(row.courseStart)}
                {row.months != null ? (
                  <span className="text-slate-500">
                    {" "}
                    （残り約{row.months}ヶ月）
                  </span>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-amber-800">
                コース開始月が未設定です。
                {editHref ? (
                  <a href={editHref} className="ml-1 font-medium underline">
                    編集画面で登録
                  </a>
                ) : null}
              </p>
            )}
            {row.nextCourse ? (
              <p className="mt-1 text-xs text-slate-500">
                次の進級先: {row.nextCourse}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
