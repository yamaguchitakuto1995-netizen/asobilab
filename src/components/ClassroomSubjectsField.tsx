"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { dayLabel } from "@/lib/days";
import { ENROLLMENT_SCHEDULE_HORIZON_DAYS } from "@/lib/enrollmentSchedule";
import {
  CLASSROOMS,
  classroomSubjects,
  formatWeekOrdinals,
  type CourseSubject,
  type LessonCapacity,
} from "@/lib/types";

function capacityMenuLabel(c: LessonCapacity): string {
  return `${formatWeekOrdinals(c.week_ordinals)}${dayLabel(c.day_of_week)} · ${c.period}コマ`;
}

type Props = {
  defaultClassroom?: string | null;
  defaultSubjects?: string[];
  /** 振替枠マスタ。所属教室・教科で絞り込んで定例コマを選ぶ */
  capacityRows?: LessonCapacity[];
  defaultEnrollmentRobotCapacityId?: string | null;
  defaultEnrollmentProgCapacityId?: string | null;
  /** 所属教室を必須にするか (デフォルト true) */
  required?: boolean;
};

/**
 * 「所属教室」セレクトと「受講教科」チェックボックスを束ねた入力部品。
 *
 * - 教室を選ぶと、その教室で開講している教科のみがチェック候補になる
 * - 教室変更時、新しい教室で開講していない教科は自動で外れる
 * - submit 時には form data に classroom と subjects[] が含まれる
 *
 * 次回テキストのプルダウンはページ側で StudentNextTextFormSection として別置き。
 */
export function ClassroomSubjectsField({
  defaultClassroom,
  defaultSubjects = [],
  capacityRows = [],
  defaultEnrollmentRobotCapacityId = null,
  defaultEnrollmentProgCapacityId = null,
  required = true,
}: Props) {
  const [classroom, setClassroom] = useState<string>(defaultClassroom ?? "");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSubjects)
  );
  const [robotCapId, setRobotCapId] = useState(
    () => defaultEnrollmentRobotCapacityId ?? ""
  );
  const [progCapId, setProgCapId] = useState(
    () => defaultEnrollmentProgCapacityId ?? ""
  );

  const allowed = useMemo<readonly CourseSubject[]>(
    () => (classroom ? classroomSubjects(classroom) : []),
    [classroom]
  );

  const robotOptions = useMemo(
    () =>
      classroom
        ? capacityRows.filter(
            (c) => c.classroom === classroom && c.subject === "ロボット"
          )
        : [],
    [classroom, capacityRows]
  );

  const progOptions = useMemo(
    () =>
      classroom
        ? capacityRows.filter(
            (c) => c.classroom === classroom && c.subject === "プログラミング"
          )
        : [],
    [classroom, capacityRows]
  );

  const robotSelectValue = robotOptions.some((c) => c.id === robotCapId)
    ? robotCapId
    : "";
  const progSelectValue = progOptions.some((c) => c.id === progCapId)
    ? progCapId
    : "";

  function handleClassroomChange(next: string) {
    setClassroom(next);
    setRobotCapId("");
    setProgCapId("");
    const allowedNow = new Set<string>(classroomSubjects(next));
    setSelected((prev) => new Set([...prev].filter((s) => allowedNow.has(s))));
  }

  function toggleSubject(subject: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(subject)) {
        n.delete(subject);
        if (subject === "ロボット") setRobotCapId("");
        if (subject === "プログラミング") setProgCapId("");
      } else {
        n.add(subject);
      }
      return n;
    });
  }

  return (
    <>
      <Field label="所属教室" htmlFor="classroom" required={required}>
        <select
          id="classroom"
          name="classroom"
          required={required}
          value={classroom}
          onChange={(e) => handleClassroomChange(e.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            選択してください
          </option>
          {CLASSROOMS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}（{c.subjects.join(" / ")}）
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="受講教科"
        hint={
          classroom
            ? "教室で開講している教科のみ表示されます。複数選択可。"
            : "先に所属教室を選択してください。"
        }
      >
        {classroom ? (
          <div
            className={
              allowed.length >= 2
                ? "grid grid-cols-2 gap-2"
                : "grid grid-cols-1 gap-2"
            }
          >
            {allowed.map((s) => (
              <label
                key={s}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-800"
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
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
            所属教室が未選択のため、受講教科を選べません。
          </div>
        )}
      </Field>

      {classroom && selected.has("ロボット") ? (
        robotOptions.length > 0 ? (
          <Field
            label="ロボット・定例コマ（任意）"
            htmlFor="enrollment_robot_capacity_id"
            hint={`教室の振替枠設定と同じ曜日・第何週・コマを選ぶと、今日から約 ${ENROLLMENT_SCHEDULE_HORIZON_DAYS} 日先まで「出席予定」が自動登録されます。編集で変えると、未実施の自動予定は置き換わります。`}
          >
            <select
              id="enrollment_robot_capacity_id"
              name="enrollment_robot_capacity_id"
              className={inputClass}
              value={robotSelectValue}
              onChange={(e) => setRobotCapId(e.target.value)}
            >
              <option value="">自動で出席予定を作らない</option>
              {robotOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {capacityMenuLabel(c)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            この教室のロボット枠が「教室・振替の設定」にまだありません。先に枠を登録すると、ここで選べます。
          </p>
        )
      ) : null}

      {classroom && selected.has("プログラミング") ? (
        progOptions.length > 0 ? (
          <Field
            label="プログラミング・定例コマ（任意）"
            htmlFor="enrollment_prog_capacity_id"
            hint={`教室の振替枠設定と同じ曜日・第何週・コマを選ぶと、今日から約 ${ENROLLMENT_SCHEDULE_HORIZON_DAYS} 日先まで「出席予定」が自動登録されます。`}
          >
            <select
              id="enrollment_prog_capacity_id"
              name="enrollment_prog_capacity_id"
              className={inputClass}
              value={progSelectValue}
              onChange={(e) => setProgCapId(e.target.value)}
            >
              <option value="">自動で出席予定を作らない</option>
              {progOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {capacityMenuLabel(c)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            この教室のプログラミング枠が「教室・振替の設定」にまだありません。先に枠を登録すると、ここで選べます。
          </p>
        )
      ) : null}
    </>
  );
}
