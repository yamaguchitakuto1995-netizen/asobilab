"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { RegularSlotLinkFields } from "@/components/RegularSlotLinkFields";
import { inferRegularSlotFromLessonDate } from "@/lib/ensureRegularSlotCapacities";
import {
  classroomSubjects,
  PERIOD_OPTIONS,
  type ClassroomPeriodTime,
  type ClassroomRecord,
} from "@/lib/types";

type Props = {
  classrooms: ClassroomRecord[];
  defaultValue?: ClassroomPeriodTime;
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
};

export function PeriodTimeForm({
  classrooms,
  defaultValue,
  action,
  submitLabel = "保存",
}: Props) {
  const [classroom, setClassroom] = useState<string>(
    defaultValue?.classroom ?? ""
  );
  const [lessonDate, setLessonDate] = useState<string>(
    defaultValue?.lesson_date ?? ""
  );
  const [period, setPeriod] = useState<number | "">(defaultValue?.period ?? "");
  const [subject, setSubject] = useState<string>(
    defaultValue?.subject ?? "__common__"
  );

  const defaultRegularParts = useMemo(() => {
    if (!defaultValue?.lesson_date || !defaultValue.period) return null;
    return inferRegularSlotFromLessonDate(
      defaultValue.lesson_date,
      defaultValue.period
    );
  }, [defaultValue]);

  const subjectChoices = useMemo(
    () => (classroom ? classroomSubjects(classroom, classrooms) : []),
    [classroom, classrooms]
  );

  const toTimeInput = (t: string | undefined) =>
    t && t.length >= 5 ? t.slice(0, 5) : "09:00";

  return (
    <form
      action={action}
      className="space-y-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
    >
      {defaultValue ? (
        <input type="hidden" name="id" value={defaultValue.id} />
      ) : null}

      <Field label="教室" htmlFor="pt_classroom" required>
        <select
          id="pt_classroom"
          name="classroom"
          required
          value={classroom}
          onChange={(e) => {
            setClassroom(e.target.value);
            setSubject("__common__");
          }}
          className={inputClass}
        >
          <option value="" disabled>
            選択してください
          </option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="開催日"
          htmlFor="pt_lesson_date"
          required
          hint="そのコマが行われる暦日（祝日など日付ごとの設定用）。"
        >
          <input
            id="pt_lesson_date"
            name="lesson_date"
            type="date"
            required
            value={lessonDate}
            onChange={(e) => setLessonDate(e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="コマ" htmlFor="pt_period" required>
          <select
            id="pt_period"
            name="period"
            required
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className={inputClass}
          >
            <option value="" disabled>
              選択
            </option>
            {PERIOD_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}コマ目
              </option>
            ))}
          </select>
        </Field>
      </div>

      <RegularSlotLinkFields
        lessonDate={lessonDate}
        period={period}
        defaultParts={defaultRegularParts}
      />

      <Field
        label="教科"
        htmlFor="pt_subject"
        hint="「共通」は全教科同時刻。教科別の場合は生徒のレギュラーコマ連動もその教科のみ。"
      >
        <select
          id="pt_subject"
          name="subject"
          disabled={!classroom}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={`${inputClass} ${!classroom ? "bg-slate-50 text-slate-400" : ""}`}
        >
          <option value="__common__">共通（全教科でこの時間）</option>
          {subjectChoices.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="開始" htmlFor="pt_start" required>
          <input
            id="pt_start"
            name="start_time"
            type="time"
            required
            step={60}
            defaultValue={toTimeInput(defaultValue?.start_time)}
            className={inputClass}
          />
        </Field>
        <Field label="終了" htmlFor="pt_end" required>
          <input
            id="pt_end"
            name="end_time"
            type="time"
            required
            step={60}
            defaultValue={toTimeInput(defaultValue?.end_time)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="メモ" htmlFor="pt_note" hint="任意">
        <input
          id="pt_note"
          name="note"
          type="text"
          maxLength={120}
          defaultValue={defaultValue?.note ?? ""}
          className={inputClass}
        />
      </Field>

      <button
        type="submit"
        className="w-full sm:w-auto rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5"
      >
        {submitLabel}
      </button>
    </form>
  );
}
