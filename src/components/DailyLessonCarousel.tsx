import Link from "next/link";
import { AttendanceBadge } from "@/components/AttendanceBadge";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { SubjectChip } from "@/components/SubjectChip";
import {
  SCHEDULED_ATTENDANCE_LABEL,
  effectiveLessonClassroom,
  periodLabel,
  type ClassroomPeriodTime,
  type Lesson,
} from "@/lib/types";
import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import { formatDateLong } from "@/lib/date";
import {
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";
import { aggregateLessonTextbookCounts } from "@/lib/lessonTextbookInventory";

export type DailyLessonItem = Lesson & {
  students: {
    id: string;
    name: string;
    grade: string;
    classroom: string | null;
    next_text_robot: string | null;
    next_text_programming: string | null;
    next_text_robot_course?: string | null;
    next_text_robot_text?: string | null;
    next_text_programming_course?: string | null;
    next_text_programming_text?: string | null;
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
  const dayTextbookCounts = aggregateLessonTextbookCounts(lessons);

  return (
    <div className="-mx-4 sm:mx-0">
      {/* ヒント表示 */}
      <p className="text-xs text-slate-500 mb-2 px-4 sm:px-0">
        ← 横にスワイプして {totalSlots} 件のコマを切り替え
      </p>

      <TextbookInventorySummary
        title={`${formatDateLong(date)}：この日の教材（全コマ合計の必要冊数）`}
        items={dayTextbookCounts}
        className="mb-3 mx-4 sm:mx-0"
      />

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
  const periodTextbookCounts = aggregateLessonTextbookCounts(lessons);

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

      <TextbookInventorySummary
        title={`このコマの教材（${lessons.length}名分・種類別冊数）`}
        items={periodTextbookCounts}
        compact
        className="border-b border-slate-100 bg-amber-50/40 px-3 py-2.5"
      />

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
          classroom: effectiveLessonClassroom(
            lesson,
            lesson.students?.classroom ?? null
          ),
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
            <ClassroomBadge
              classroom={effectiveLessonClassroom(
                lesson,
                lesson.students?.classroom ?? null
              )}
            />
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
      {lesson.subject === "ロボット"
        ? (() => {
            const st = lesson.students;
            const r = st
              ? resolveRobotNextTextPartsForStudent({
                  next_text_robot: st.next_text_robot,
                  next_text_robot_course: st.next_text_robot_course,
                  next_text_robot_text: st.next_text_robot_text,
                })
              : null;
            return r ? (
              <p className="mt-1.5 text-[11px] text-amber-900/90 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 leading-snug space-y-0.5">
                <span className="font-medium text-amber-950/80 mr-1 block">
                  次回テキスト（ロボット）
                </span>
                <span className="block">
                  <span className="text-amber-800/80">コース</span> {r.course}{" "}
                  <span className="text-amber-800/80">· テキスト名</span>{" "}
                  {r.text}
                </span>
                {r.full ? (
                  <span className="block text-[10px] text-amber-800/70">
                    表記: {r.full}
                  </span>
                ) : null}
              </p>
            ) : null;
          })()
        : null}
      {lesson.subject === "プログラミング"
        ? (() => {
            const st = lesson.students;
            const r = st
              ? resolveProgrammingNextTextPartsForStudent({
                  next_text_programming: st.next_text_programming,
                  next_text_programming_course: st.next_text_programming_course,
                  next_text_programming_text: st.next_text_programming_text,
                })
              : null;
            return r ? (
              <p className="mt-1.5 text-[11px] text-indigo-900/90 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1 leading-snug space-y-0.5">
                <span className="font-medium text-indigo-950/80 mr-1 block">
                  次回テキスト（プログラミング）
                </span>
                <span className="block">
                  <span className="text-indigo-800/80">コース</span> {r.course}{" "}
                  <span className="text-indigo-800/80">· テキスト名</span>{" "}
                  {r.text}
                </span>
                {r.full ? (
                  <span className="block text-[10px] text-indigo-800/70">
                    表記: {r.full}
                  </span>
                ) : null}
              </p>
            ) : null;
          })()
        : null}
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

function TextbookInventorySummary({
  title,
  items,
  compact,
  className = "",
}: {
  title: string;
  items: { label: string; count: number }[];
  compact?: boolean;
  className?: string;
}) {
  const total = items.reduce((s, x) => s + x.count, 0);
  return (
    <div
      className={`rounded-xl border border-amber-200/80 bg-amber-50/50 ${className}`}
      role="region"
      aria-label={title}
    >
      <p
        className={`font-semibold text-amber-950 ${
          compact ? "text-[11px] mb-1.5" : "text-xs mb-2"
        }`}
      >
        {title}
        {!compact ? (
          <span className="ml-2 font-normal text-amber-900/80">
            合計 <strong>{total}</strong> 名分（1件＝1冊換算）
          </span>
        ) : null}
      </p>
      <ul
        className={`space-y-1 ${
          compact ? "text-[11px] text-amber-950/90" : "text-xs text-amber-950/90"
        }`}
      >
        {items.map(({ label, count }) => (
          <li
            key={`${label}:${count}`}
            className="flex items-start justify-between gap-2 leading-snug"
          >
            <span className="min-w-0 break-words pr-1">{label}</span>
            <span className="shrink-0 tabular-nums font-semibold text-amber-900">
              {count}冊
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
