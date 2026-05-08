import Link from "next/link";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { SubjectChip } from "@/components/SubjectChip";
import {
  SCHEDULED_ATTENDANCE_LABEL,
  periodLabel,
  type ClassroomPeriodTime,
  type Lesson,
} from "@/lib/types";
import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";

export type DailyLessonItem = Lesson & {
  students: {
    id: string;
    name: string;
    grade: string;
    classroom: string | null;
  } | null;
};

type Props = {
  date: string;
  lessons: DailyLessonItem[];
  classroomPeriodTimes?: ClassroomPeriodTime[];
};

/**
 * 1コマ = 1カードの横スクロールカルーセル。
 * - スマホ・PC とも CSS scroll-snap でネイティブスクロール
 * - コマごとに「生徒 / 科目 / 教科書」を一覧
 * - コマ未設定のレッスンは末尾の「コマ未設定」カードに集約
 */
export function DailyLessonCarousel({
  date,
  lessons,
  classroomPeriodTimes = [],
}: Props) {
  if (lessons.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">
        この日の授業や予定はまだ登録されていません。
      </div>
    );
  }

  // period 順 (null は最後) にグルーピング
  const map = new Map<number | null, DailyLessonItem[]>();
  for (const l of lessons) {
    const key = l.period ?? null;
    const arr = map.get(key) ?? [];
    arr.push(l);
    map.set(key, arr);
  }
  const groups = Array.from(map.entries()).sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });

  const totalSlots = groups.length;

  return (
    <div className="-mx-4 sm:mx-0">
      {/* ヒント表示 */}
      <p className="text-xs text-slate-500 mb-2 px-4 sm:px-0">
        ← 横にスワイプして {totalSlots} 件のコマを切り替え
      </p>

      <div
        className="
          flex gap-3 overflow-x-auto pb-4 px-4 sm:px-0
          snap-x snap-mandatory scroll-pl-4 sm:scroll-pl-0
          [-webkit-overflow-scrolling:touch]
          [scrollbar-width:thin]
        "
        role="list"
        aria-label="本日のコマ表"
      >
        {groups.map(([period, items]) => (
          <PeriodCard
            key={period ?? "none"}
            date={date}
            period={period}
            lessons={items}
            classroomPeriodTimes={classroomPeriodTimes}
          />
        ))}
      </div>
    </div>
  );
}

function PeriodCard({
  date,
  period,
  lessons,
  classroomPeriodTimes,
}: {
  date: string;
  period: number | null;
  lessons: DailyLessonItem[];
  classroomPeriodTimes: ClassroomPeriodTime[];
}) {
  const scheduledCount = lessons.filter((l) => l.status === "scheduled").length;
  const recordedCount = lessons.length - scheduledCount;

  return (
    <article
      className="
        snap-start shrink-0
        w-[88%] sm:w-80 md:w-96
        bg-white border border-slate-200 rounded-2xl
        flex flex-col overflow-hidden
        shadow-sm
      "
      role="listitem"
    >
      <header
        className={`px-4 py-3 border-b ${
          period
            ? "bg-brand-50 border-brand-100"
            : "bg-slate-50 border-slate-100"
        } flex items-center justify-between`}
      >
        <h3
          className={`text-sm font-semibold ${
            period ? "text-brand-900" : "text-slate-700"
          }`}
        >
          {periodLabel(period)}
        </h3>
        <div className="text-xs text-slate-600 flex items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-white ring-1 ring-slate-200 px-2 py-0.5 font-medium">
            {lessons.length}名
          </span>
          {scheduledCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-brand-100 text-brand-800 px-2 py-0.5 text-[10px] font-medium">
              予定 {scheduledCount}
            </span>
          ) : null}
          {recordedCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-medium">
              記録 {recordedCount}
            </span>
          ) : null}
        </div>
      </header>

      <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
        {lessons.map((l) => (
          <li key={l.id}>
            <StudentSlot
              lesson={l}
              date={date}
              period={period}
              classroomPeriodTimes={classroomPeriodTimes}
            />
          </li>
        ))}
      </ul>
    </article>
  );
}

function StudentSlot({
  lesson,
  date,
  period,
  classroomPeriodTimes,
}: {
  lesson: DailyLessonItem;
  date: string;
  period: number | null;
  classroomPeriodTimes: ClassroomPeriodTime[];
}) {
  const isScheduled = lesson.status === "scheduled";
  const studentName = lesson.students?.name ?? "(削除済み)";
  const grade = lesson.students?.grade;
  const href = lesson.students ? `/students/${lesson.students.id}` : "#";

  const slotRow =
    period && classroomPeriodTimes.length
      ? resolveClassroomPeriodTime(classroomPeriodTimes, {
          classroom: lesson.students?.classroom,
          lessonDate: date,
          period,
          subject: lesson.subject,
        })
      : null;

  return (
    <Link
      href={href}
      className="block px-4 py-3 hover:bg-slate-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm truncate">{studentName}</span>
            {grade ? (
              <span className="text-[11px] text-slate-500 shrink-0">
                {grade}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ClassroomBadge classroom={lesson.students?.classroom} />
            <SubjectChip subject={lesson.subject} />
            {isScheduled ? (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-brand-100 text-brand-800 ring-brand-600/20">
                {SCHEDULED_ATTENDANCE_LABEL[lesson.attendance]}
              </span>
            ) : (
              <AttendanceBadge status={lesson.attendance} size="sm" />
            )}
          </div>
          {slotRow ? (
            <p className="text-[11px] text-slate-500 mt-1">
              {formatTimeRange(slotRow.start_time, slotRow.end_time)}
            </p>
          ) : null}
        </div>
      </div>
      {lesson.textbook ? (
        <p className="mt-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 leading-snug">
          <span className="text-[10px] text-slate-500 font-medium mr-1">
            教科書
          </span>
          {lesson.textbook}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-slate-400 italic">
          教科書未設定
        </p>
      )}
      {lesson.text_memo ? (
        <p className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-snug">
          {lesson.text_memo}
        </p>
      ) : null}
    </Link>
  );
}
