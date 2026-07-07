"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
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
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  useEffect(() => {
    setPendingDate(null);
  }, [selectedDate]);

  const today = todayIso();
  const [yStr, mStr] = calYm.split("-");
  const year = Number(yStr);
  const month = Number(mStr);

  const first = new Date(year, month - 1, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const prevYm = shiftMonth(calYm, -1);
  const nextYm = shiftMonth(calYm, +1);

  function buildHref(dateIso: string | null, ym?: string): string {
    const sp = new URLSearchParams(params.toString());
    if (!dateIso || dateIso === today) {
      sp.delete("date");
    } else {
      sp.set("date", dateIso);
    }
    const ymVal = ym ?? calYm;
    if (ymVal !== currentYm()) {
      sp.set("cal_ym", ymVal);
    } else {
      sp.delete("cal_ym");
    }
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function selectDate(dateIso: string) {
    if (dateIso === selectedDate) return;
    setPendingDate(dateIso);
    startTransition(() => {
      router.push(buildHref(dateIso));
    });
  }

  const cells: Array<{ day: number | null; dateIso: string | null }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, dateIso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYm}-${`${d}`.padStart(2, "0")}`;
    cells.push({ day: d, dateIso: ds });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateIso: null });

  return (
    <div
      className={`bg-white border border-slate-200 rounded-2xl p-4 transition-opacity ${
        isPending ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">日付カレンダー</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            日付をタップしてコマ表を表示（過去日も可）
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={buildHref(selectedDate, prevYm)}
            className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-slate-100"
            aria-label="前の月"
          >
            ‹
          </Link>
          <span className="text-sm font-medium px-2">{ymLabel(calYm)}</span>
          <Link
            href={buildHref(selectedDate, nextYm)}
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

      <div className="grid grid-cols-7 gap-1" role="grid" aria-label="日付カレンダー">
        {cells.map((c, idx) => {
          if (c.day === null || !c.dateIso) {
            return <div key={idx} className="aspect-square" />;
          }

          const isSelected = c.dateIso === selectedDate;
          const isToday = c.dateIso === today;
          const isPast = c.dateIso < today;
          const hasLessons = datesWithLessons?.has(c.dateIso);
          const isLoading = pendingDate === c.dateIso && isPending;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => selectDate(c.dateIso!)}
              disabled={isPending}
              aria-current={isSelected ? "date" : undefined}
              aria-pressed={isSelected}
              className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-bold relative transition-all ${
                isSelected
                  ? "bg-brand-900 text-white shadow-lg ring-[3px] ring-slate-900 ring-offset-2 scale-[1.08] z-[1]"
                  : isLoading
                    ? "bg-brand-200 text-brand-950 ring-2 ring-brand-800 animate-pulse font-bold"
                    : isToday
                      ? "bg-white text-brand-800 ring-2 ring-brand-300 hover:bg-brand-50"
                      : "bg-slate-50 text-slate-700 hover:bg-slate-100 hover:ring-1 hover:ring-slate-300"
              }`}
              title={`${c.dateIso} のコマ表`}
            >
              {c.day}
              {hasLessons ? (
                <span
                  className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                    isSelected
                      ? "bg-white/90"
                      : isPast
                        ? "bg-slate-400"
                        : "bg-brand-500"
                  }`}
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400" />
          過去に授業あり
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3.5 h-3.5 rounded bg-brand-900 ring-[2px] ring-brand-950 ring-offset-1" />
          選択中
        </span>
      </div>
    </div>
  );
}
