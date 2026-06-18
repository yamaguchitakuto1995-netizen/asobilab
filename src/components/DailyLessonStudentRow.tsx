"use client";

import { useState } from "react";
import { AttendanceConfirmDialog } from "@/components/AttendanceConfirmDialog";
import { SubjectChip } from "@/components/SubjectChip";
import { formatTimeRange, resolveClassroomPeriodTime } from "@/lib/periodTimes";
import {
  dailyAttendanceStatusLabel,
  isDailyExpectedPresentAbsent,
  lessonTodayTextLabel,
} from "@/lib/todayLessonDisplay";
import {
  effectiveLessonClassroom,
  type ClassroomPeriodTime,
} from "@/lib/types";
import type { DailyLessonItem } from "./DailyLessonCarousel";

type Props = {
  lesson: DailyLessonItem;
  date: string;
  period: number | null;
  previousMemo: string | null;
  classroomPeriodTimes: ClassroomPeriodTime[];
};

export function DailyLessonStudentRow({
  lesson,
  date,
  period,
  previousMemo,
  classroomPeriodTimes,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const st = lesson.students;
  const regularClassroom = st?.classroom ?? null;
  const todayText = lessonTodayTextLabel(lesson, st);
  const attendanceLabel = dailyAttendanceStatusLabel(lesson);
  const emphasizeAbsent = isDailyExpectedPresentAbsent(lesson);

  const slotRow =
    period && classroomPeriodTimes.length
      ? resolveClassroomPeriodTime(classroomPeriodTimes, {
          classroom: effectiveLessonClassroom(lesson, regularClassroom),
          lessonDate: date,
          period,
          subject: lesson.subject,
        })
      : null;

  return (
    <>
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div>
              <p className="font-medium text-sm text-slate-900">{st?.name ?? "（削除済み）"}</p>
              {st?.name_kana ? (
                <p className="text-[11px] text-slate-500">{st.name_kana}</p>
              ) : null}
            </div>
            <dl className="text-[11px] text-slate-600 space-y-0.5">
              <div className="flex gap-1">
                <dt className="text-slate-400 shrink-0">学年</dt>
                <dd>{st?.grade ?? "—"}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-slate-400 shrink-0">レギュラー教室</dt>
                <dd>{regularClassroom ?? "—"}</dd>
              </div>
              <div className="flex gap-1 items-center">
                <dt className="text-slate-400 shrink-0">教科</dt>
                <dd>
                  <SubjectChip subject={lesson.subject} />
                </dd>
              </div>
              <div className="flex gap-1 items-center">
                <dt className="text-slate-400 shrink-0">出欠</dt>
                <dd
                  className={
                    emphasizeAbsent
                      ? "text-xs font-bold text-rose-600"
                      : "font-medium text-slate-800"
                  }
                >
                  {attendanceLabel}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-slate-400 shrink-0">本日のテキスト</dt>
                <dd className="text-slate-800">{todayText}</dd>
              </div>
              <div className="flex gap-1">
                <dt className="text-slate-400 shrink-0">前回の備考</dt>
                <dd className="text-slate-700 whitespace-pre-wrap">
                  {previousMemo ?? "—"}
                </dd>
              </div>
            </dl>
            {slotRow ? (
              <p className="text-[10px] text-slate-400">
                {formatTimeRange(slotRow.start_time, slotRow.end_time)}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-2"
        >
          {lesson.status === "scheduled" ? "出席確認" : "内容を更新"}
        </button>
      </div>

      <AttendanceConfirmDialog
        key={lesson.id}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        lesson={lesson}
        date={date}
        defaultTodayText={todayText}
      />
    </>
  );
}
