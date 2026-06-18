"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { DAYS_OF_WEEK } from "@/lib/days";
import {
  REGULAR_WEEK_GROUPS,
  capacityToRegularSlotParts,
  regularSlotLabel,
  resolveEnrollmentCapacityId,
  type RegularSlotParts,
  type RegularWeekGroupId,
} from "@/lib/regularSlot";
import { PERIOD_OPTIONS, type LessonCapacity } from "@/lib/types";

type Props = {
  subject: "ロボット" | "プログラミング";
  /** form field prefix: enrollment_robot | enrollment_prog */
  namePrefix: "enrollment_robot" | "enrollment_prog";
  classroom: string;
  capacityRows: LessonCapacity[];
  defaultCapacityId?: string | null;
};

export function RegularSlotPickerField({
  subject,
  namePrefix,
  classroom,
  capacityRows,
  defaultCapacityId = null,
}: Props) {
  const defaultCap = useMemo(
    () => capacityRows.find((c) => c.id === defaultCapacityId),
    [capacityRows, defaultCapacityId]
  );
  const defaultParts = useMemo(
    () => capacityToRegularSlotParts(defaultCap),
    [defaultCap]
  );

  const [weekGroupId, setWeekGroupId] = useState<RegularWeekGroupId | "">(
    () => defaultParts?.weekGroupId ?? ""
  );
  const [dayOfWeek, setDayOfWeek] = useState<number | "">(
    () => defaultParts?.dayOfWeek ?? ""
  );
  const [period, setPeriod] = useState<number | "">(
    () => defaultParts?.period ?? ""
  );

  const subjectCapacities = useMemo(
    () =>
      capacityRows.filter(
        (c) => c.classroom === classroom && c.subject === subject
      ),
    [capacityRows, classroom, subject]
  );

  const resolvedId = useMemo(() => {
    if (!weekGroupId || dayOfWeek === "" || period === "") return null;
    return resolveEnrollmentCapacityId(subjectCapacities, {
      classroom,
      subject,
      weekGroupId,
      dayOfWeek,
      period,
    });
  }, [subjectCapacities, classroom, subject, weekGroupId, dayOfWeek, period]);

  const preview =
    weekGroupId && dayOfWeek !== "" && period !== ""
      ? regularSlotLabel({
          weekGroupId,
          dayOfWeek,
          period,
        } as RegularSlotParts)
      : null;

  const legacyCap =
    defaultCapacityId && !defaultParts && defaultCap ? defaultCap : null;

  if (subjectCapacities.length === 0) {
    return (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        この教室の{subject}枠が「教室・振替の設定」にまだありません。第1・3週 /
        第2・4週 の枠を先に登録してください。
      </p>
    );
  }

  return (
    <Field
      label={`${subject}・レギュラー出席コマ`}
      hint="週グループ（第1・3 / 第2・4）・曜日・コマを選びます。コマ時刻が登録されると出席予定が自動追加されます。"
    >
      <div className="space-y-2">
        {legacyCap ? (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            現在の設定（{subject}）は第1・3 / 第2・4 以外の週設定です。下で選び直してください。
          </p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label
              htmlFor={`${namePrefix}_week_group`}
              className="block text-[11px] text-slate-500 mb-1"
            >
              週グループ
            </label>
            <select
              id={`${namePrefix}_week_group`}
              name={`${namePrefix}_week_group`}
              className={inputClass}
              value={weekGroupId}
              onChange={(e) =>
                setWeekGroupId(e.target.value as RegularWeekGroupId | "")
              }
            >
              <option value="">未設定</option>
              {REGULAR_WEEK_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`${namePrefix}_day_of_week`}
              className="block text-[11px] text-slate-500 mb-1"
            >
              曜日
            </label>
            <select
              id={`${namePrefix}_day_of_week`}
              name={`${namePrefix}_day_of_week`}
              className={inputClass}
              value={dayOfWeek === "" ? "" : String(dayOfWeek)}
              onChange={(e) =>
                setDayOfWeek(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
            >
              <option value="">未設定</option>
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.long}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`${namePrefix}_period`}
              className="block text-[11px] text-slate-500 mb-1"
            >
              コマ
            </label>
            <select
              id={`${namePrefix}_period`}
              name={`${namePrefix}_period`}
              className={inputClass}
              value={period === "" ? "" : String(period)}
              onChange={(e) =>
                setPeriod(e.target.value === "" ? "" : Number(e.target.value))
              }
            >
              <option value="">未設定</option>
              {PERIOD_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}コマ目
                </option>
              ))}
            </select>
          </div>
        </div>

        {preview ? (
          <p className="text-xs text-slate-600">
            選択中: <span className="font-medium text-slate-800">{preview}</span>
          </p>
        ) : null}

        {weekGroupId && dayOfWeek !== "" && period !== "" && !resolvedId ? (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
            「教室・振替の設定」に {preview}（{REGULAR_WEEK_GROUPS.find((g) => g.id === weekGroupId)?.label}）の枠がありません。先に枠を登録してください。
          </p>
        ) : null}
      </div>
    </Field>
  );
}
