import { ClassroomBadge } from "@/components/ClassroomBadge";
import { SubjectChip } from "@/components/SubjectChip";
import { formatDateLong, formatDateShort } from "@/lib/date";
import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import {
  SCHEDULED_ATTENDANCE_LABEL,
  effectiveLessonClassroom,
  type AttendanceStatus,
  type ClassroomPeriodTime,
} from "@/lib/types";

export type PortalScheduleLesson = {
  id: string;
  lesson_date: string;
  period: number;
  subject: string;
  attendance: AttendanceStatus;
  lesson_classroom?: string | null;
  source_lesson_date?: string | null;
  source_period?: number | null;
  source_subject?: string | null;
};

type Props = {
  lessons: PortalScheduleLesson[];
  studentName: string;
  studentClassroom: string | null;
  periodTimes: ClassroomPeriodTime[];
};

export function ParentLessonScheduleList({
  lessons,
  studentName,
  studentClassroom,
  periodTimes,
}: Props) {
  if (lessons.length === 0) {
    return (
      <div className="bg-white border border-dashed border-sky-200 rounded-xl p-6 text-center text-sm text-slate-500">
        {studentName} さんのこの期間の授業予定はありません。
      </div>
    );
  }

  return (
    <ul className="bg-white border border-sky-200 rounded-2xl divide-y divide-sky-100 overflow-hidden">
      {lessons.map((lesson) => {
        const lessonVenue = effectiveLessonClassroom(
          lesson,
          studentClassroom
        );
        const slotRow =
          lesson.period && periodTimes.length && lessonVenue
            ? resolveClassroomPeriodTime(periodTimes, {
                classroom: lessonVenue,
                lessonDate: lesson.lesson_date,
                period: lesson.period,
                subject: lesson.subject,
              })
            : null;
        const isMakeup = lesson.attendance === "makeup";

        return (
          <li
            key={lesson.id}
            className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-slate-900">
                  {formatDateLong(lesson.lesson_date)}
                </span>
                {slotRow ? (
                  <span className="text-sm text-slate-600">
                    {formatTimeRange(slotRow.start_time, slotRow.end_time)}
                  </span>
                ) : lesson.period ? (
                  <span className="text-sm text-slate-600">
                    {lesson.period}コマ目
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SubjectChip subject={lesson.subject} />
                {lessonVenue ? (
                  <ClassroomBadge classroom={lessonVenue} />
                ) : null}
                {!slotRow && lesson.period ? (
                  <span className="text-xs text-slate-500">
                    {lesson.period}コマ目
                  </span>
                ) : null}
              </div>
              {isMakeup && lesson.source_lesson_date ? (
                <p className="text-xs text-sky-900">
                  元の欠席: {formatDateShort(lesson.source_lesson_date)}
                  {lesson.source_period != null
                    ? ` ${lesson.source_period}コマ目`
                    : ""}
                  {lesson.source_subject ? `（${lesson.source_subject}）` : ""}
                </p>
              ) : null}
            </div>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                isMakeup
                  ? "bg-violet-100 text-violet-800 ring-violet-600/20"
                  : lesson.attendance === "absent"
                    ? "bg-slate-100 text-slate-700 ring-slate-300/50"
                    : "bg-brand-100 text-brand-800 ring-brand-600/20"
              }`}
            >
              {SCHEDULED_ATTENDANCE_LABEL[lesson.attendance]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
