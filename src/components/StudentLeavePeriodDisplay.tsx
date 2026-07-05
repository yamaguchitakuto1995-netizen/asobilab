import Link from "next/link";
import {
  formatLeavePeriodRange,
  leavePeriodStatus,
  leavePeriodStatusLabel,
  type StudentLeavePeriod,
} from "@/lib/studentLeave";

type Props = {
  student: StudentLeavePeriod;
  editHref?: string;
};

/** 生徒情報ページ用の休会期間表示 */
export function StudentLeavePeriodDisplay({ student, editHref }: Props) {
  const range = formatLeavePeriodRange(student);
  if (!range) return null;

  const status = leavePeriodStatus(student);
  const statusLabel = status ? leavePeriodStatusLabel(status) : null;

  return (
    <section className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-900">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <h2 className="font-semibold text-slate-900">休会期間</h2>
        {statusLabel ? (
          <span
            className={
              status === "active"
                ? "inline-flex items-center rounded-full bg-slate-600 px-2 py-0.5 text-[11px] font-semibold text-white"
                : status === "upcoming"
                  ? "inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                  : "inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200"
            }
          >
            {statusLabel}
          </span>
        ) : null}
      </div>
      <p className="text-base font-semibold text-slate-800">{range}</p>
      <p className="text-xs text-slate-600 mt-1">
        この期間の授業コマは「休会中」として表示されます。
      </p>
      {editHref ? (
        <p className="text-xs mt-2">
          <Link href={editHref} className="text-brand-700 font-medium hover:underline">
            休会設定を変更
          </Link>
        </p>
      ) : null}
    </section>
  );
}
