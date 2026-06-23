"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { dowOf, DAYS_OF_WEEK, dayLabel } from "@/lib/days";
import { weekdayOccurrenceInMonth } from "@/lib/enrollmentSchedule";
import {
  getWeekGroupOccurrenceMismatchWarning,
  inferRegularSlotFromLessonDate,
} from "@/lib/ensureRegularSlotCapacities";
import {
  REGULAR_WEEK_GROUPS,
  regularSlotLabel,
  type RegularSlotParts,
  type RegularWeekGroupId,
} from "@/lib/regularSlot";

type Props = {
  /** 開催日（暦日）。変更時に曜日を自動反映 */
  lessonDate?: string;
  /** コマ番号（レギュラーコマと共通） */
  period: number | "";
  defaultParts?: RegularSlotParts | null;
};

function suggestWeekGroup(lessonDate: string): RegularWeekGroupId | "" {
  const occ = weekdayOccurrenceInMonth(lessonDate);
  if (occ === 1 || occ === 3) return "1-3";
  if (occ === 2 || occ === 4) return "2-4";
  return "";
}

export function RegularSlotLinkFields({
  lessonDate = "",
  period,
  defaultParts = null,
}: Props) {
  const [weekGroupId, setWeekGroupId] = useState<RegularWeekGroupId | "">(
    () => defaultParts?.weekGroupId ?? ""
  );
  const [dayOfWeek, setDayOfWeek] = useState<number | "">(
    () => defaultParts?.dayOfWeek ?? ""
  );

  useEffect(() => {
    if (!lessonDate) return;
    const dow = dowOf(lessonDate);
    setDayOfWeek(dow);
    setWeekGroupId((prev) => {
      if (prev) return prev;
      return suggestWeekGroup(lessonDate) || "";
    });
  }, [lessonDate]);

  const dateHint = useMemo(() => {
    if (!lessonDate) return null;
    const dow = dowOf(lessonDate);
    const occ = weekdayOccurrenceInMonth(lessonDate);
    return `${dayLabel(dow)}曜・第${occ}週`;
  }, [lessonDate]);

  const dayMismatch = useMemo(() => {
    if (!lessonDate || dayOfWeek === "") return null;
    const dow = dowOf(lessonDate);
    if (dow !== dayOfWeek) {
      return `開催日は${dayLabel(dow)}曜ですが、選択中は${dayLabel(dayOfWeek)}曜です。`;
    }
    return null;
  }, [lessonDate, dayOfWeek]);

  const weekMismatchWarning = useMemo(() => {
    if (!lessonDate || weekGroupId === "") return null;
    return getWeekGroupOccurrenceMismatchWarning(lessonDate, weekGroupId);
  }, [lessonDate, weekGroupId]);

  const preview =
    weekGroupId !== "" && dayOfWeek !== "" && period !== ""
      ? regularSlotLabel({
          weekGroupId,
          dayOfWeek,
          period,
        })
      : null;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 sm:p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-emerald-950">
          レギュラー出席コマ
        </p>
        <p className="text-xs text-emerald-900/80 mt-0.5 leading-relaxed">
          生徒のレギュラー設定と出席予定の連動に使います。第1・3 / 第2・4 は枠の名称です（開催日が第5週などでも設定できます）。未登録の振替枠は保存時に自動作成されます。
        </p>
      </div>

      {dateHint ? (
        <p className="text-xs text-slate-700 bg-white/80 border border-slate-200 rounded-lg px-2 py-1.5">
          開催日の判定: <span className="font-medium">{dateHint}</span>
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label="週グループ" htmlFor="regular_week_group" required>
          <select
            id="regular_week_group"
            name="regular_week_group"
            required
            className={inputClass}
            value={weekGroupId}
            onChange={(e) =>
              setWeekGroupId(e.target.value as RegularWeekGroupId | "")
            }
          >
            <option value="" disabled>
              選択してください
            </option>
            {REGULAR_WEEK_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="曜日" htmlFor="regular_day_of_week" required>
          <select
            id="regular_day_of_week"
            name="regular_day_of_week"
            required
            className={inputClass}
            value={dayOfWeek === "" ? "" : String(dayOfWeek)}
            onChange={(e) =>
              setDayOfWeek(
                e.target.value === "" ? "" : Number(e.target.value)
              )
            }
          >
            <option value="" disabled>
              選択してください
            </option>
            {DAYS_OF_WEEK.map((d) => (
              <option key={d.value} value={d.value}>
                {d.long}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {preview ? (
        <p className="text-xs text-slate-700">
          連動枠: <span className="font-medium text-slate-900">{preview}</span>
        </p>
      ) : null}

      {dayMismatch ? (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
          {dayMismatch}
        </p>
      ) : null}

      {weekMismatchWarning ? (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
          {weekMismatchWarning.replace(/このまま保存しますか？$/, "保存時に確認します。")}
        </p>
      ) : null}
    </div>
  );
}
