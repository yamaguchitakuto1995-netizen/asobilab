"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import { RegularSlotPickerField } from "@/components/RegularSlotPickerField";
import {
  classroomSubjects,
  type ClassroomRecord,
  type CourseSubject,
  type LessonCapacity,
} from "@/lib/types";

type Props = {
  classrooms: ClassroomRecord[];
  defaultClassroom?: string | null;
  defaultSubjects?: string[];
  capacityRows?: LessonCapacity[];
  defaultEnrollmentRobotCapacityId?: string | null;
  defaultEnrollmentProgCapacityId?: string | null;
  required?: boolean;
};

export function ClassroomSubjectsField({
  classrooms,
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

  const allowed = useMemo<readonly CourseSubject[]>(
    () => (classroom ? classroomSubjects(classroom, classrooms) : []),
    [classroom, classrooms]
  );

  function handleClassroomChange(next: string) {
    setClassroom(next);
    const allowedNow = new Set<string>(
      classroomSubjects(next, classrooms) as string[]
    );
    setSelected((prev) => new Set([...prev].filter((s) => allowedNow.has(s))));
  }

  function toggleSubject(subject: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(subject)) n.delete(subject);
      else n.add(subject);
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
          {classrooms.map((c) => (
            <option key={c.id} value={c.name}>
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
        <RegularSlotPickerField
          key={`robot-${classroom}-${defaultEnrollmentRobotCapacityId ?? ""}`}
          subject="ロボット"
          namePrefix="enrollment_robot"
          classroom={classroom}
          capacityRows={capacityRows}
          defaultCapacityId={defaultEnrollmentRobotCapacityId}
        />
      ) : null}

      {classroom && selected.has("プログラミング") ? (
        <RegularSlotPickerField
          key={`prog-${classroom}-${defaultEnrollmentProgCapacityId ?? ""}`}
          subject="プログラミング"
          namePrefix="enrollment_prog"
          classroom={classroom}
          capacityRows={capacityRows}
          defaultCapacityId={defaultEnrollmentProgCapacityId}
        />
      ) : null}
    </>
  );
}
