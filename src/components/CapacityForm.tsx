"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { DAYS_OF_WEEK } from "@/lib/days";
import {
  classroomSubjects,
  PERIOD_OPTIONS,
  WEEK_ORDINAL_OPTIONS,
  type ClassroomRecord,
  type LessonCapacity,
} from "@/lib/types";

type Props = {
  classrooms: ClassroomRecord[];
  /** 既存値があれば編集モード */
  defaultValue?: LessonCapacity;
  /** Server Action */
  action: (formData: FormData) => Promise<void>;
  /** 既存と同じ (教室,曜日,コマ,教科) の組合せをハイライト用に渡す (重複防止のヒント) */
  takenKeys?: string[];
  submitLabel?: string;
};

export function CapacityForm({
  classrooms,
  defaultValue,
  action,
  takenKeys = [],
  submitLabel = "追加",
}: Props) {
  const [classroom, setClassroom] = useState<string>(
    defaultValue?.classroom ?? ""
  );
  const [dow, setDow] = useState<number | "">(defaultValue?.day_of_week ?? "");
  const [period, setPeriod] = useState<number | "">(defaultValue?.period ?? "");
  const [subject, setSubject] = useState<string>(defaultValue?.subject ?? "");

  const subjectChoices = useMemo(
    () => (classroom ? classroomSubjects(classroom, classrooms) : []),
    [classroom, classrooms]
  );

  const currentKey =
    classroom && dow !== "" && period !== "" && subject
      ? `${classroom}|${dow}|${period}|${subject}`
      : "";
  const isDuplicate =
    !!currentKey &&
    takenKeys.includes(currentKey) &&
    currentKey !==
      (defaultValue
        ? `${defaultValue.classroom}|${defaultValue.day_of_week}|${defaultValue.period}|${defaultValue.subject}`
        : "");

  const initialWeeks =
    defaultValue?.week_ordinals?.length &&
    defaultValue.week_ordinals.length > 0
      ? defaultValue.week_ordinals
      : [1, 2, 3, 4, 5];

  return (
    <form
      action={action}
      className="space-y-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
    >
      {defaultValue ? (
        <input type="hidden" name="id" value={defaultValue.id} />
      ) : null}

      <Field label="教室" htmlFor="classroom" required>
        <select
          id="classroom"
          name="classroom"
          required
          value={classroom}
          onChange={(e) => {
            setClassroom(e.target.value);
            setSubject("");
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
        <Field label="曜日" htmlFor="day_of_week" required>
          <select
            id="day_of_week"
            name="day_of_week"
            required
            value={dow}
            onChange={(e) => setDow(Number(e.target.value))}
            className={inputClass}
          >
            <option value="" disabled>
              選択
            </option>
            {DAYS_OF_WEEK.map((d) => (
              <option key={d.value} value={d.value}>
                {d.long}
              </option>
            ))}
          </select>
        </Field>

        <Field label="コマ" htmlFor="period" required>
          <select
            id="period"
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
        label="開催週（月内の第◯週のその曜日）"
        htmlFor="week_o_1"
        required
        hint="例: 第2・第4日曜の授業なら「第2週」「第4週」だけチェック。どの開催日も同じ受け入れ人数が適用されます。"
      >
        <div className="flex flex-wrap gap-3">
          {WEEK_ORDINAL_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
            >
              <input
                id={value === 1 ? "week_o_1" : undefined}
                type="checkbox"
                name="week_ordinals"
                value={String(value)}
                defaultChecked={initialWeeks.includes(value)}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {label}
            </label>
          ))}
        </div>
      </Field>

      <Field label="教科" htmlFor="subject" required>
        <select
          id="subject"
          name="subject"
          required
          disabled={!classroom}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={`${inputClass} ${!classroom ? "bg-slate-50 text-slate-400" : ""}`}
        >
          <option value="" disabled>
            {classroom ? "選択してください" : "先に教室を選択"}
          </option>
          {subjectChoices.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="最大受け入れ人数"
        htmlFor="max_students"
        required
        hint="この枠で受け入れ可能な振替申込の上限（定例の出席予定は含みません）。0 にすると振替を受け付けません。新規は 4 名が初期値です。"
      >
        <input
          id="max_students"
          name="max_students"
          type="number"
          min={0}
          max={99}
          required
          defaultValue={defaultValue?.max_students ?? 4}
          className={inputClass}
        />
      </Field>

      <Field label="メモ" htmlFor="note" hint="講師名・備考など (任意)">
        <input
          id="note"
          name="note"
          type="text"
          maxLength={120}
          defaultValue={defaultValue?.note ?? ""}
          className={inputClass}
          placeholder="例) 担当: 山口"
        />
      </Field>

      {isDuplicate ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠ この (教室・曜日・コマ・教科) の枠はすでに設定されています。保存すると重複エラーになります。
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isDuplicate}
        className="w-full sm:w-auto rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitLabel}
      </button>
    </form>
  );
}
