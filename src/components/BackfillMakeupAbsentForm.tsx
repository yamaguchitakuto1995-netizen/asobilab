"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import {
  COURSE_SUBJECTS,
  PERIOD_OPTIONS,
  type ClassroomPeriodTime,
  type ClassroomRecord,
} from "@/lib/types";
import { shiftDate, todayIso } from "@/lib/date";

type Props = {
  studentId: string;
  cancelHref: string;
  action: (formData: FormData) => Promise<void>;
  studentSubjects?: string[];
  studentClassroom?: string | null;
  classrooms: ClassroomRecord[];
  classroomPeriodTimes?: ClassroomPeriodTime[];
  error?: string;
};

export function BackfillMakeupAbsentForm({
  studentId,
  cancelHref,
  action,
  studentSubjects,
  studentClassroom,
  classrooms,
  classroomPeriodTimes = [],
  error,
}: Props) {
  const maxPastDate = shiftDate(todayIso(), -1);
  const [lessonDate, setLessonDate] = useState(maxPastDate);
  const [periodStr, setPeriodStr] = useState("");
  const [subjectStr, setSubjectStr] = useState("");
  const [venueStr, setVenueStr] = useState("");

  const subjectChoices =
    studentSubjects && studentSubjects.length > 0
      ? COURSE_SUBJECTS.filter((s) => studentSubjects.includes(s))
      : COURSE_SUBJECTS;

  const slotHint = useMemo(() => {
    const venue = venueStr || studentClassroom || null;
    if (!venue || !classroomPeriodTimes.length) return null;
    const p = periodStr ? Number(periodStr) : null;
    if (!p) return null;
    const row = resolveClassroomPeriodTime(classroomPeriodTimes, {
      classroom: venue,
      lessonDate,
      period: p,
      subject: subjectStr || null,
    });
    return row ? formatTimeRange(row.start_time, row.end_time) : null;
  }, [
    venueStr,
    studentClassroom,
    classroomPeriodTimes,
    lessonDate,
    periodStr,
    subjectStr,
  ]);

  return (
    <form
      action={action}
      className="space-y-4 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6"
    >
      <input type="hidden" name="student_id" value={studentId} />

      <p className="text-sm text-slate-600 leading-relaxed">
        システム導入前の振替対象となる欠席を、過去日付で手動登録します。
        登録後は保護者の振替申請・職員の振替登録の対象になります。
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="授業日（過去）" htmlFor="lesson_date" required>
          <input
            id="lesson_date"
            name="lesson_date"
            type="date"
            required
            max={maxPastDate}
            value={lessonDate}
            onChange={(e) => setLessonDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="コマ" htmlFor="period" required>
          <select
            id="period"
            name="period"
            required
            value={periodStr}
            onChange={(e) => setPeriodStr(e.target.value)}
            className={inputClass}
          >
            <option value="">選択</option>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}コマ目
              </option>
            ))}
          </select>
        </Field>
      </div>

      {slotHint ? (
        <p className="text-xs text-emerald-700 -mt-2">設定時刻: {slotHint}</p>
      ) : null}

      <Field label="実施会場" htmlFor="lesson_classroom">
        <select
          id="lesson_classroom"
          name="lesson_classroom"
          value={venueStr}
          onChange={(e) => setVenueStr(e.target.value)}
          className={inputClass}
        >
          <option value="">所属教室と同じ</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="科目" htmlFor="subject" required>
        <select
          id="subject"
          name="subject"
          required
          value={subjectStr}
          onChange={(e) => setSubjectStr(e.target.value)}
          className={inputClass}
        >
          <option value="">選択</option>
          {subjectChoices.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="メモ" htmlFor="text_memo" hint="任意。未入力時は既定のメモが入ります。">
        <textarea
          id="text_memo"
          name="text_memo"
          rows={3}
          maxLength={2000}
          placeholder="例) システム導入前の欠席分"
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
          欠席（振替可能）として登録
        </button>
      </div>
    </form>
  );
}
