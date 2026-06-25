"use client";

import { useEffect, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import {
  COURSE_SUBJECTS,
  type ClassroomRecord,
} from "@/lib/types";

type Props = {
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
  defaultValue?: ClassroomRecord;
};

export function ClassroomForm({
  action,
  submitLabel = "教室を登録",
  defaultValue,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultValue?.subjects ?? [])
  );

  useEffect(() => {
    if (defaultValue?.subjects) {
      setSelected(new Set(defaultValue.subjects));
    }
  }, [defaultValue]);

  function toggleSubject(subject: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(subject)) n.delete(subject);
      else n.add(subject);
      return n;
    });
  }

  return (
    <form
      action={action}
      className="space-y-4 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5"
    >
      {defaultValue ? (
        <input type="hidden" name="id" value={defaultValue.id} />
      ) : null}

      <Field
        label="教室名"
        htmlFor="classroom_name"
        required
        hint="生徒の所属教室・コマ時刻・振替枠で共通して使われます。"
      >
        <input
          id="classroom_name"
          name="name"
          type="text"
          required
          maxLength={80}
          className={inputClass}
          placeholder="例: ○○教室"
          defaultValue={defaultValue?.name ?? ""}
        />
      </Field>

      <Field
        label="開講教科"
        hint="この教室で受講できる教科を1つ以上選びます。生徒登録時の選択肢に反映されます。"
        required
      >
        <div className="grid grid-cols-2 gap-2">
          {COURSE_SUBJECTS.map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
            >
              <input
                type="checkbox"
                name="subjects"
                value={s}
                checked={selected.has(s)}
                onChange={() => toggleSubject(s)}
                className="accent-brand-600"
              />
              <span className="text-sm font-medium">{s}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="コマ定員（初期値）"
        htmlFor="default_max_students"
        required
        hint="1コマあたりの合計上限（レギュラー出席＋振替）。新規に自動作成される振替枠の初期値です。各枠は「振替枠の設定」で個別に変更できます。"
      >
        <input
          id="default_max_students"
          name="default_max_students"
          type="number"
          min={0}
          max={99}
          required
          className={inputClass}
          defaultValue={defaultValue?.default_max_students ?? 4}
        />
      </Field>

      <Field label="メモ" htmlFor="classroom_note" hint="所在地・担当など任意">
        <textarea
          id="classroom_note"
          name="note"
          rows={2}
          maxLength={300}
          className={inputClass}
          placeholder="例: 2026年4月オープン予定"
          defaultValue={defaultValue?.note ?? ""}
        />
      </Field>

      {!defaultValue ? (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 leading-relaxed">
          登録後、この教室は生徒登録・CSV取込・振替枠・コマ時刻の選択肢に自動で追加されます。続けて
          <span className="font-medium">振替枠</span>と
          <span className="font-medium">コマ時刻</span>
          を設定してください。
        </p>
      ) : null}

      <button
        type="submit"
        className="w-full sm:w-auto rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5"
      >
        {submitLabel}
      </button>
    </form>
  );
}
