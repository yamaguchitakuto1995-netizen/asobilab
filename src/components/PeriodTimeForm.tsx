"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import {
  CLASSROOMS,
  PERIOD_OPTIONS,
  classroomSubjects,
  type ClassroomPeriodTime,
} from "@/lib/types";

type Props = {
  defaultValue?: ClassroomPeriodTime;
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
};

export function PeriodTimeForm({
  defaultValue,
  action,
  submitLabel = "保存",
}: Props) {
  const [classroom, setClassroom] = useState<string>(
    defaultValue?.classroom ?? ""
  );
  const [period, setPeriod] = useState<number | "">(defaultValue?.period ?? "");
  const [subject, setSubject] = useState<string>(
    defaultValue?.subject ?? "__common__"
  );

  const subjectChoices = useMemo(
    () => (classroom ? classroomSubjects(classroom) : []),
    [classroom]
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
          {CLASSROOMS.map((c) => (
            <option key={c.name} value={c.name}>
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
          hint="第◯週ではなく、そのコマが行われる暦日を指定します。同じ週でも日付ごとに時間が違えば、日付ごとに行を分けて登録してください。"
        >
          <input
            id="pt_lesson_date"
            name="lesson_date"
            type="date"
            required
            defaultValue={defaultValue?.lesson_date ?? ""}
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

      <Field
        label="教科"
        htmlFor="pt_subject"
        hint="「共通」を選ぶと、ロボット・プログラミングどちらもこの時間で表示されます。教科で別時間ならここで選びます。"
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
