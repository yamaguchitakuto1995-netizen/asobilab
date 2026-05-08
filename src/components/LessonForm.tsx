"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import {
  ATTENDANCE_OPTIONS,
  COURSE_SUBJECTS,
  PERIOD_OPTIONS,
  SCHEDULED_ATTENDANCE_OPTIONS,
  type AttendanceStatus,
  type ClassroomPeriodTime,
  type LessonStatus,
} from "@/lib/types";
import { todayIso } from "@/lib/date";

type Props = {
  studentId: string;
  cancelHref: string;
  action: (formData: FormData) => Promise<void>;
  defaultValues?: {
    lessonDate?: string;
    period?: number | null;
    attendance?: AttendanceStatus;
    subject?: string | null;
    textbook?: string | null;
    status?: LessonStatus;
    textMemo?: string | null;
  };
  /**
   * 生徒に紐づく受講教科。指定された教科のみ選択肢として表示する。
   * 未指定なら COURSE_SUBJECTS 全部を表示。
   */
  studentSubjects?: string[];
  studentClassroom?: string | null;
  classroomPeriodTimes?: ClassroomPeriodTime[];
  submitLabel?: string;
  error?: string;
  lessonId?: string;
};

export function LessonForm({
  studentId,
  cancelHref,
  action,
  defaultValues,
  studentSubjects,
  studentClassroom,
  classroomPeriodTimes = [],
  submitLabel = "記録する",
  error,
  lessonId,
}: Props) {
  const defaultDate = defaultValues?.lessonDate ?? todayIso();
  const defaultStatus: LessonStatus = defaultValues?.status ?? "recorded";
  const defaultAttendance: AttendanceStatus =
    defaultValues?.attendance ?? "present";

  const [status, setStatus] = useState<LessonStatus>(defaultStatus);
  const [attendance, setAttendance] = useState<AttendanceStatus>(defaultAttendance);
  const [lessonDate, setLessonDate] = useState(defaultDate);
  const [periodStr, setPeriodStr] = useState<string>(
    defaultValues?.period != null ? String(defaultValues.period) : ""
  );
  const [subjectStr, setSubjectStr] = useState(defaultValues?.subject ?? "");

  // 予定モードに切り替えた瞬間に「遅刻」が選ばれていたら 出席 に補正
  useEffect(() => {
    if (status === "scheduled" && attendance === "late") {
      setAttendance("present");
    }
  }, [status, attendance]);

  const attendanceOptions =
    status === "scheduled" ? SCHEDULED_ATTENDANCE_OPTIONS : ATTENDANCE_OPTIONS;

  const subjectChoices =
    studentSubjects && studentSubjects.length > 0
      ? COURSE_SUBJECTS.filter((s) => studentSubjects.includes(s))
      : COURSE_SUBJECTS;

  const slotHint = useMemo(() => {
    if (!studentClassroom || !classroomPeriodTimes.length) return null;
    const p = periodStr ? Number(periodStr) : null;
    if (!p) return null;
    const row = resolveClassroomPeriodTime(classroomPeriodTimes, {
      classroom: studentClassroom,
      lessonDate,
      period: p,
      subject: subjectStr || null,
    });
    return row ? formatTimeRange(row.start_time, row.end_time) : null;
  }, [studentClassroom, classroomPeriodTimes, lessonDate, periodStr, subjectStr]);

  return (
    <form
      action={action}
      className="space-y-4 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6"
    >
      <input type="hidden" name="student_id" value={studentId} />
      {lessonId ? <input type="hidden" name="lesson_id" value={lessonId} /> : null}

      <Field label="種別" htmlFor="status" required>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800">
            <input
              type="radio"
              name="status"
              value="recorded"
              checked={status === "recorded"}
              onChange={() => setStatus("recorded")}
              className="accent-brand-600"
            />
            <span className="text-sm font-medium">記録済み</span>
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800">
            <input
              type="radio"
              name="status"
              value="scheduled"
              checked={status === "scheduled"}
              onChange={() => setStatus("scheduled")}
              className="accent-brand-600"
            />
            <span className="text-sm font-medium">予定</span>
          </label>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="授業日" htmlFor="lesson_date" required>
          <input
            id="lesson_date"
            name="lesson_date"
            type="date"
            required
            value={lessonDate}
            onChange={(e) => setLessonDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="コマ" htmlFor="period" hint="日毎のコマ表で使用">
          <select
            id="period"
            name="period"
            value={periodStr}
            onChange={(e) => setPeriodStr(e.target.value)}
            className={inputClass}
          >
            <option value="">未設定</option>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}コマ目
              </option>
            ))}
          </select>
        </Field>
      </div>

      {slotHint ? (
        <p className="text-xs text-emerald-700 -mt-2">
          設定時刻: {slotHint}
        </p>
      ) : null}

      <Field label="科目" htmlFor="subject">
        <select
          id="subject"
          name="subject"
          value={subjectStr}
          onChange={(e) => setSubjectStr(e.target.value)}
          className={inputClass}
        >
          <option value="">選択しない</option>
          {subjectChoices.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="使用テキスト"
        htmlFor="textbook"
        hint="例) Scratch 3.0 入門 / レゴ WeDo 2.0 標準セット"
      >
        <input
          id="textbook"
          name="textbook"
          type="text"
          maxLength={120}
          defaultValue={defaultValues?.textbook ?? ""}
          className={inputClass}
          placeholder="教材名・章を記入"
        />
      </Field>

      <Field
        label={status === "scheduled" ? "出席予定" : "出欠"}
        htmlFor="attendance"
        required
      >
        <div className={status === "scheduled" ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
          {attendanceOptions.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
            >
              <input
                type="radio"
                name="attendance"
                value={opt.value}
                checked={attendance === opt.value}
                onChange={() => setAttendance(opt.value as AttendanceStatus)}
                className="accent-brand-600"
              />
              <span className="text-sm font-medium">{opt.label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field
        label={status === "scheduled" ? "予定メモ" : "本日のテキスト内容"}
        htmlFor="text_memo"
        hint={
          status === "scheduled"
            ? "持ち物・連絡事項などを自由に。"
            : "どこまで進んだか・宿題・気づきなどを自由に。"
        }
      >
        <textarea
          id="text_memo"
          name="text_memo"
          rows={6}
          maxLength={2000}
          defaultValue={defaultValues?.textMemo ?? ""}
          placeholder={
            status === "scheduled"
              ? "例) 19:00開始。前回宿題の答え合わせから。"
              : "例) プログラミング基礎 第3章まで完了。\n変数とループは理解OK。次回は条件分岐から。"
          }
          className={inputClass}
        />
      </Field>

      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Link
          href={cancelHref}
          className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5"
        >
          キャンセル
        </Link>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
