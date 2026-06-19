"use client";

import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import { formatDateLong } from "@/lib/date";
import {
  groupLessonsByClassroomSubject,
  groupLessonsByPeriod,
} from "@/lib/dailyLessonFilter";
import { aggregateLessonTextbookCounts } from "@/lib/lessonTextbookInventory";
import {
  periodLabel,
  type ClassroomPeriodTime,
} from "@/lib/types";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { SubjectChip } from "@/components/SubjectChip";
import { DailyLessonStudentRow } from "@/components/DailyLessonStudentRow";
import type { Lesson } from "@/lib/types";

export type DailyLessonItem = Lesson & {
  students: {
    id: string;
    name: string;
    name_kana?: string | null;
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
  previousMemos?: Record<string, string | null>;
  /** 教室行の並び順（DB sort_order） */
  classroomOrderNames?: string[];
};

/**
 * 教室×教科ごとに縦に並べ、各ブロック内で 1コマ = 1カードの横スクロール。
 */
export function DailyLessonCarousel({
  date,
  lessons,
  classroomPeriodTimes = [],
  previousMemos = {},
  classroomOrderNames = [],
}: Props) {
  if (lessons.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">
        この日の授業や予定はまだ登録されていません。
      </div>
    );
  }

  const classroomOrder = new Map<string, number>();
  classroomOrderNames.forEach((name, i) => classroomOrder.set(name, i));

  const segments = groupLessonsByClassroomSubject(lessons, classroomOrder);
  const dayTextbookCounts = aggregateLessonTextbookCounts(lessons);
  const multiSegment = segments.length > 1;

  return (
    <div className="-mx-4 sm:mx-0 space-y-6">
      <PeriodMaterialSummary
        title={`${formatDateLong(date)}：この日の教材（全コマ合計）`}
        items={dayTextbookCounts}
        className="mx-4 sm:mx-0"
      />

      {segments.map((segment) => {
        const periodGroups = groupLessonsByPeriod(segment.lessons);
        const segmentLabel = [
          segment.classroom ?? "教室未設定",
          segment.subject ?? "科目未設定",
        ].join(" · ");

        return (
          <section
            key={`${segment.classroom ?? ""}:${segment.subject ?? ""}`}
            aria-label={`${segmentLabel} のコマ表`}
          >
            {multiSegment ? (
              <div className="flex flex-wrap items-center gap-2 mb-2 px-4 sm:px-0">
                <ClassroomBadge classroom={segment.classroom} size="md" />
                <SubjectChip subject={segment.subject} size="md" />
                <span className="text-xs text-slate-500">
                  {segment.lessons.length}名 · {periodGroups.length}コマ
                </span>
              </div>
            ) : null}

            <p className="text-xs text-slate-500 mb-2 px-4 sm:px-0">
              ← 横にスワイプして {periodGroups.length} 件のコマを切り替え
              {multiSegment ? `（${segment.classroom ?? "教室未設定"}）` : ""}
            </p>

            <div
              className="
                flex gap-3 overflow-x-auto pb-4 px-4 sm:px-0
                snap-x snap-mandatory scroll-pl-4 sm:scroll-pl-0
                [-webkit-overflow-scrolling:touch]
                [scrollbar-width:thin]
              "
              role="list"
            >
              {periodGroups.map(([period, items]) => (
                <PeriodCard
                  key={period ?? "none"}
                  date={date}
                  period={period}
                  lessons={items}
                  classroom={segment.classroom}
                  subject={segment.subject}
                  classroomPeriodTimes={classroomPeriodTimes}
                  previousMemos={previousMemos}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PeriodCard({
  date,
  period,
  lessons,
  classroom,
  subject,
  classroomPeriodTimes,
  previousMemos,
}: {
  date: string;
  period: number | null;
  lessons: DailyLessonItem[];
  classroom: string | null;
  subject: string | null;
  classroomPeriodTimes: ClassroomPeriodTime[];
  previousMemos: Record<string, string | null>;
}) {
  const scheduledCount = lessons.filter((l) => l.status === "scheduled").length;
  const recordedCount = lessons.length - scheduledCount;
  const periodMaterials = aggregateLessonTextbookCounts(lessons);

  const timeHint =
    period && classroomPeriodTimes.length
      ? (() => {
          const row = resolveClassroomPeriodTime(classroomPeriodTimes, {
            classroom,
            lessonDate: date,
            period,
            subject,
          });
          return row ? formatTimeRange(row.start_time, row.end_time) : null;
        })()
      : null;

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
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <h3
            className={`text-sm font-semibold ${
              period ? "text-brand-900" : "text-slate-700"
            }`}
          >
            {periodLabel(period)}
            {timeHint ? (
              <span className="ml-2 text-xs font-normal text-slate-600">
                {timeHint}
              </span>
            ) : null}
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
        </div>
      </header>

      <PeriodMaterialSummary
        title="このコマの教材内容"
        items={periodMaterials}
        compact
        className="border-b border-slate-100 bg-amber-50/50 px-3 py-2.5"
      />

      <ul className="max-h-[65vh] overflow-y-auto p-2 space-y-2">
        {lessons.map((l) => (
          <li key={l.id}>
            <DailyLessonStudentRow
              lesson={l}
              date={date}
              period={period}
              previousMemo={previousMemos[l.id] ?? null}
              classroomPeriodTimes={classroomPeriodTimes}
            />
          </li>
        ))}
      </ul>
    </article>
  );
}

function PeriodMaterialSummary({
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
  if (items.length === 0) {
    return (
      <div className={`text-xs text-slate-500 ${className}`}>
        <p className="font-semibold text-slate-700">{title}</p>
        <p className="mt-1">教材情報なし</p>
      </div>
    );
  }

  return (
    <div className={className} role="region" aria-label={title}>
      <p
        className={`font-semibold text-amber-950 ${
          compact ? "text-[11px] mb-1.5" : "text-xs mb-2"
        }`}
      >
        {title}
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
            {!compact ? (
              <span className="shrink-0 tabular-nums font-semibold text-amber-900">
                {count}名
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
