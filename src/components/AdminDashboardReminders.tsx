import Link from "next/link";
import { acknowledgeMakeupExpiryReminder } from "@/app/(dashboard)/actions";
import type {
  DashboardPromotionEntry,
  DashboardPromotionPreview,
} from "@/lib/dashboardPromotionPreview";
import type { MakeupExpiryReminder } from "@/lib/makeupExpiryReminders";
import { periodLabel } from "@/lib/types";

type Props = {
  makeupReminders: MakeupExpiryReminder[];
  promotionPreview: DashboardPromotionPreview;
  returnDate?: string;
};

export function AdminDashboardReminders({
  makeupReminders,
  promotionPreview,
  returnDate,
}: Props) {
  const hasMakeup = makeupReminders.length > 0;
  const hasPromotion = promotionPreview.entries.length > 0;

  if (!hasMakeup && !hasPromotion) return null;

  return (
    <div className="space-y-4">
      {hasMakeup ? (
        <section className="bg-rose-50 border border-rose-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-200 bg-rose-100/60">
            <h2 className="text-sm font-semibold text-rose-950">
              振替失効リマインド
            </h2>
            <p className="text-xs text-rose-800/80 mt-0.5">
              対応済にするまで一覧の上に表示されます。
            </p>
          </div>
          <ul className="divide-y divide-rose-100">
            {makeupReminders.map((item) => (
              <li
                key={item.lessonId}
                className="px-4 py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-rose-950 leading-relaxed">
                    {item.message}
                  </p>
                  <p className="text-xs text-rose-800/70 mt-1">
                    {item.subject} · {periodLabel(item.period)}
                    <Link
                      href={`/students/${item.studentId}`}
                      className="ml-2 text-rose-700 hover:underline"
                    >
                      生徒詳細へ
                    </Link>
                  </p>
                </div>
                <form action={acknowledgeMakeupExpiryReminder} className="shrink-0">
                  <input type="hidden" name="lesson_id" value={item.lessonId} />
                  {returnDate ? (
                    <input type="hidden" name="return_date" value={returnDate} />
                  ) : null}
                  <button
                    type="submit"
                    className="rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 text-xs font-medium px-3 py-2"
                  >
                    対応済
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasPromotion ? (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-100/60">
            <h2 className="text-sm font-semibold text-amber-950">
              {promotionPreview.monthLabel}
            </h2>
            <p className="text-xs text-amber-800/80 mt-0.5">
              準備や保護者への案内の確認用です（来月のコース進級予定）。
            </p>
          </div>
          <ul className="divide-y divide-amber-100">
            {groupPromotionEntries(promotionPreview.entries).map((group) => (
              <li key={group.subject} className="px-4 py-3">
                <p className="text-xs font-semibold text-amber-900 mb-2">
                  {group.subject}
                </p>
                <ul className="space-y-1.5">
                  {group.entries.map((entry) => (
                    <li
                      key={`${entry.studentId}-${entry.subject}`}
                      className="text-sm text-amber-950 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                    >
                      <Link
                        href={`/students/${entry.studentId}`}
                        className="font-medium hover:underline"
                      >
                        {entry.studentName}
                      </Link>
                      <span className="text-amber-900/80">{entry.courseLabel}</span>
                      <span className="text-xs rounded-full bg-amber-200/80 text-amber-950 px-2 py-0.5">
                        {entry.promotionKindLabel}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function groupPromotionEntries(entries: DashboardPromotionEntry[]) {
  const map = new Map<string, DashboardPromotionEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.subject) ?? [];
    list.push(entry);
    map.set(entry.subject, list);
  }
  return [...map.entries()].map(([subject, subjectEntries]) => ({
    subject,
    entries: subjectEntries,
  }));
}
