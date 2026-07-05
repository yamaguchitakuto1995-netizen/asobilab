import Link from "next/link";
import { ATTENDANCE_BADGE, type AttendanceStatus, type LessonStatus } from "@/lib/types";
import { shiftMonth, ymLabel } from "@/lib/date";

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type CalendarLesson = {
  lesson_date: string;
  attendance: AttendanceStatus;
  status: LessonStatus;
};

type Props = {
  ym: string;
  lessons: CalendarLesson[];
  baseHref: string;
};

const RECORDED_BG: Record<AttendanceStatus, string> = {
  present: "bg-emerald-500 text-white",
  absent:  "bg-rose-500   text-white",
  late:    "bg-amber-500  text-white",
  makeup:  "bg-sky-500    text-white",
  on_leave: "bg-slate-400 text-white",
};

const SCHEDULED_BG: Record<AttendanceStatus, string> = {
  present: "bg-white text-emerald-700 border-2 border-dashed border-emerald-400",
  absent:  "bg-white text-rose-700    border-2 border-dashed border-rose-400",
  late:    "bg-white text-amber-700   border-2 border-dashed border-amber-400",
  makeup:  "bg-white text-sky-700     border-2 border-dashed border-sky-400",
  on_leave: "bg-slate-100 text-slate-600 border-2 border-dashed border-slate-400",
};

export function AttendanceCalendar({ ym, lessons, baseHref }: Props) {
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month = Number(mStr);

  const first = new Date(year, month - 1, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const byDate = new Map<string, { status: LessonStatus; attendance: AttendanceStatus }>();
  for (const l of lessons) {
    if (!l.lesson_date.startsWith(ym)) continue;
    // 同日に複数あれば、recorded を優先
    const existing = byDate.get(l.lesson_date);
    if (!existing || (existing.status === "scheduled" && l.status === "recorded")) {
      byDate.set(l.lesson_date, { status: l.status, attendance: l.attendance });
    }
  }

  const cells: Array<{
    day: number | null;
    info: { status: LessonStatus; attendance: AttendanceStatus } | null;
  }> = [];
  for (let i = 0; i < startOffset; i++) cells.push({ day: null, info: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${ym}-${`${d}`.padStart(2, "0")}`;
    cells.push({ day: d, info: byDate.get(ds) ?? null });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, info: null });

  const prevYm = shiftMonth(ym, -1);
  const nextYm = shiftMonth(ym, +1);
  const sep = baseHref.includes("?") ? "&" : "?";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">出欠カレンダー</h3>
        <div className="flex items-center gap-1">
          <Link
            href={`${baseHref}${sep}ym=${prevYm}`}
            className="px-2 py-1 rounded-md text-sm text-slate-600 hover:bg-slate-100"
            aria-label="前の月"
          >
            ‹
          </Link>
          <span className="text-sm font-medium px-2">{ymLabel(ym)}</span>
          <Link
            href={`${baseHref}${sep}ym=${nextYm}`}
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
          if (c.day === null) {
            return <div key={idx} className="aspect-square" />;
          }
          if (c.info) {
            const cls =
              c.info.status === "scheduled"
                ? SCHEDULED_BG[c.info.attendance]
                : RECORDED_BG[c.info.attendance];
            return (
              <div
                key={idx}
                className={`aspect-square flex items-center justify-center rounded-md text-xs font-semibold ${cls}`}
                title={`${c.info.status === "scheduled" ? "予定: " : ""}${c.info.attendance}`}
              >
                {c.day}
              </div>
            );
          }
          return (
            <div
              key={idx}
              className="aspect-square flex items-center justify-center rounded-md text-xs text-slate-500 bg-slate-50"
            >
              {c.day}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-slate-600">
        <Legend className={ATTENDANCE_BADGE.present} label="出席" />
        <Legend className={ATTENDANCE_BADGE.absent} label="欠席" />
        <Legend className={ATTENDANCE_BADGE.late} label="遅刻" />
        <Legend className={ATTENDANCE_BADGE.makeup} label="振替" />
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-white border-2 border-dashed border-slate-400" />
          予定 (枠線)
        </span>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-3 h-3 rounded ring-1 ring-inset ${className}`} />
      {label}
    </span>
  );
}
