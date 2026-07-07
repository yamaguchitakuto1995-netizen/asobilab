import Link from "next/link";
import { currentYm, shiftMonth, todayIso, ymLabel } from "@/lib/date";

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type Props = {
  selectedDate: string;
  calYm: string;
  /** その月に授業・予定がある日（YYYY-MM-DD） */
  datesWithLessons?: ReadonlySet<string>;
};

export function DashboardDateCalendar({
  selectedDate,
  calYm,
  datesWithLessons,
}: Props) {
  const [yStr, mStr] = calYm.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const today = todayIso();

  const first = new Date(year, month - 1, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const prevYm = shiftMonth(calYm, -1);
  const nextYm = shiftMonth(calYm, +1);

  function dayHref(dateIso: string): string {
    if (dateIso === today) return "/";
    return `/?date=${dateIso}`;
  }

  function monthHref(ym: string): string {
    const params = new URLSearchParams();
    if (selectedDate !== today) params.set("date", selectedDate);
    if (ym !== currentYm()) params.set("cal_ym", ym);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  const cells: Array<{ day: number | null; dateIso: string | null }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, dateIso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYm}-${`${d}`.padStart(2, "0")}`;
    cells.push({ day: d, dateIso: ds });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateIso: null });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">日付カレンダー</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            日付をタップしてコマ表を表示（過去日も可）
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={monthHref(prevYm)}
            className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-slate-100"
            aria-label="前の月"
          >
            ‹
          </Link>
          <span className="text-sm font-medium px-2">{ymLabel(calYm)}</span>
          <Link
            href={monthHref(nextYm)}
            className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-slate-100"
            aria-label="次の月"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-slate-500 mb-1">
        {WEEK_LABELS.map((w, i) => (
          <div key={w} className={i === 0 ? "text-rose-500" : i === 6 ? "text-sky-500" : ""}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, idx) => {
          if (c.day === null || !c.dateIso) {
            return <div key={idx} className="aspect-square" />;
          }

          const isSelected = c.dateIso === selectedDate;
          const isToday = c.dateIso === today;
          const hasLessons = datesWithLessons?.has(c.dateIso);

          return (
            <Link
              key={idx}
              href={dayHref(c.dateIso)}
              className={`aspect-square flex flex-col items-center justify-center rounded-md text-xs font-medium relative ${
                isSelected
                  ? "bg-brand-600 text-white"
                  : isToday
                    ? "bg-brand-50 text-brand-800 ring-1 ring-brand-300"
                    : hasLessons
                      ? "bg-slate-100 text-slate-800 hover:bg-brand-50"
                      : "bg-slate-50 text-slate-600 hover:bg-brand-50 hover:text-brand-700"
              }`}
              title={`${c.dateIso} のコマ表`}
            >
              {c.day}
              {hasLessons && !isSelected ? (
                <span className="absolute bottom-1 w-1 h-1 rounded-full bg-brand-500" />
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
