import Link from "next/link";
import { ATTENDANCE_BADGE, type AttendanceStatus, type LessonStatus } from "@/lib/types";
import { shiftMonth, ymLabel } from "@/lib/date";

const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

type CalendarLesson = {
  id: string;
  lesson_date: string;
  attendance: AttendanceStatus;
  status: LessonStatus;
};

type Props = {
  ym: string;
  studentId: string;
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

function lessonHref(studentId: string, lesson: CalendarLesson): string {
  if (lesson.status === "recorded") {
    return `/students/${studentId}/lessons/${lesson.id}/edit`;
  }
  return `/students/${studentId}/lessons/new?date=${lesson.lesson_date}`;
}

export function AttendanceCalendar({ ym, studentId, lessons, baseHref }: Props) {
  const [yStr, mStr] = ym.split("-");
  const year = Number(yStr);
  const month = Number(mStr);

  const first = new Date(year, month - 1, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const byDate = new Map<string, CalendarLesson>();
  for (const l of lessons) {
    if (!l.lesson_date.startsWith(ym)) continue;
    const existing = byDate.get(l.lesson_date);
    if (!existing || (existing.status === "scheduled" && l.status === "recorded")) {
      byDate.set(l.lesson_date, l);
    }
  }

  const cells: Array<{
    day: number | null;
    dateIso: string | null;
    lesson: CalendarLesson | null;
  }> = [];
  for (let i = 0; i < startOffset; i++) {
    cells.push({ day: null, dateIso: null, lesson: null });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${ym}-${`${d}`.padStart(2, "0")}`;
    cells.push({ day: d, dateIso: ds, lesson: byDate.get(ds) ?? null });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: null, dateIso: null, lesson: null });
  }

  const prevYm = shiftMonth(ym, -1);
  const nextYm = shiftMonth(ym, +1);
  const sep = baseHref.includes("?") ? "&" : "?";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">出欠カレンダー</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            日付タップで出席登録・編集／右上「表」でトップのコマ表へ
          </p>
        </div>
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
          if (c.day === null || !c.dateIso) {
            return <div key={idx} className="aspect-square" />;
          }

          const newHref = `/students/${studentId}/lessons/new?date=${c.dateIso}`;

          if (c.lesson) {
            const cls =
              c.lesson.status === "scheduled"
                ? SCHEDULED_BG[c.lesson.attendance]
                : RECORDED_BG[c.lesson.attendance];
            return (
              <div
                key={idx}
                className={`aspect-square relative rounded-md text-xs font-semibold ${cls}`}
              >
                <Link
                  href={lessonHref(studentId, c.lesson)}
                  className="absolute inset-0 flex items-center justify-center hover:opacity-90 rounded-md"
                  title={`${c.lesson.status === "scheduled" ? "予定: " : ""}${c.lesson.attendance}（タップで編集）`}
                >
                  {c.day}
                </Link>
                <Link
                  href={`/?date=${c.dateIso}`}
                  className="absolute top-0 right-0 z-10 min-w-[18px] h-[18px] flex items-center justify-center rounded-bl-md rounded-tr-md bg-white/90 text-[9px] font-bold text-brand-700 hover:bg-brand-100"
                  title="トップのコマ表でこの日を見る"
                >
                  表
                </Link>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="aspect-square relative rounded-md bg-slate-50"
            >
              <Link
                href={newHref}
                className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 hover:bg-brand-50 hover:text-brand-700 rounded-md"
                title="この日の出席を登録"
              >
                {c.day}
              </Link>
              <Link
                href={`/?date=${c.dateIso}`}
                className="absolute top-0 right-0 z-10 min-w-[18px] h-[18px] flex items-center justify-center rounded-bl-md rounded-tr-md bg-white text-[9px] font-bold text-brand-700 hover:bg-brand-100 ring-1 ring-slate-200"
                title="トップのコマ表でこの日を見る"
              >
                表
              </Link>
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
