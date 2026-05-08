"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { shiftDate, todayIso } from "@/lib/date";

type Props = {
  date: string;
};

/**
 * ?date=YYYY-MM-DD で日付を切り替えるナビゲーションバー。
 * 前日 / 今日 / 翌日 ボタンと <input type="date"> を提供。
 */
export function DailyDateNav({ date }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const today = todayIso();

  function navigate(next: string) {
    const sp = new URLSearchParams(params);
    if (next === today) {
      sp.delete("date");
    } else {
      sp.set("date", next);
    }
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  const prev = shiftDate(date, -1);
  const next = shiftDate(date, +1);
  const isToday = date === today;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${isPending ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={() => navigate(prev)}
        className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-2.5 py-1.5"
        aria-label="前日"
      >
        ← 前日
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => {
          if (e.target.value) navigate(e.target.value);
        }}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      <button
        type="button"
        onClick={() => navigate(next)}
        className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-2.5 py-1.5"
        aria-label="翌日"
      >
        翌日 →
      </button>
      {!isToday ? (
        <button
          type="button"
          onClick={() => navigate(today)}
          className="rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 text-sm font-medium px-2.5 py-1.5"
        >
          今日
        </button>
      ) : null}
    </div>
  );
}
