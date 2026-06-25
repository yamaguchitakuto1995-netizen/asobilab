"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { DAYS_OF_WEEK } from "@/lib/days";
import {
  REGULAR_WEEK_GROUPS,
  capacityToRegularSlotParts,
  regularSlotLabel,
  weekGroupFromCapacity,
  type RegularWeekGroupId,
} from "@/lib/regularSlot";
import { PERIOD_OPTIONS, classroomSubjects, type ClassroomRecord, type LessonCapacity } from "@/lib/types";

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
  const defaultParts = useMemo(
    () => capacityToRegularSlotParts(defaultValue),
    [defaultValue]
  );
  const [weekGroupId, setWeekGroupId] = useState<RegularWeekGroupId | "">(
    () => defaultParts?.weekGroupId ?? ""
  );
  const [dow, setDow] = useState<number | "">(
    defaultValue?.day_of_week ?? ""
  );
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

  const legacyWeeks =
    defaultValue &&
    !defaultParts &&
    weekGroupFromCapacity(defaultValue) === null;

  const slotPreview =
    weekGroupId && dow !== "" && period !== ""
      ? regularSlotLabel({
          weekGroupId,
          dayOfWeek: dow,
          period,
        })
      : null;

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

      <Field
        label="レギュラーコマ（週グループ・曜日・コマ）"
        htmlFor="week_group"
        required
        hint="登録済み教室の第1・3週 / 第2・4週 × 曜日 × コマで振替枠を特定します。"
      >
        <div className="space-y-2">
          {legacyWeeks ? (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              現在の週設定は第1・3 / 第2・4 以外です。下で選び直してください。
            </p>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label
                htmlFor="week_group"
                className="block text-[11px] text-slate-500 mb-1"
              >
                週グループ
              </label>
              <select
                id="week_group"
                name="week_group"
                required
                value={weekGroupId}
                onChange={(e) =>
                  setWeekGroupId(e.target.value as RegularWeekGroupId | "")
                }
                className={inputClass}
              >
                <option value="" disabled>
                  選択
                </option>
                {REGULAR_WEEK_GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="day_of_week"
                className="block text-[11px] text-slate-500 mb-1"
              >
                曜日
              </label>
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
            </div>

            <div>
              <label
                htmlFor="period"
                className="block text-[11px] text-slate-500 mb-1"
              >
                コマ
              </label>
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
            </div>
          </div>

          {slotPreview && classroom ? (
            <p className="text-xs text-slate-600">
              選択中:{" "}
              <span className="font-medium text-slate-800">
                {classroom} · {slotPreview}
              </span>
            </p>
          ) : null}
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
        label="コマ定員"
        htmlFor="max_students"
        required
        hint="このコマの合計上限（レギュラー出席＋振替）。欠席予定は枠を空けます。0 にすると振替を受け付けません。"
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
