"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { StudentTextInfoSummary } from "@/components/StudentTextInfo";
import { SubjectChip } from "@/components/SubjectChip";
import type { CourseSubject, Student } from "@/lib/types";
import { deleteStudentsBulk } from "@/app/(dashboard)/students/actions";

type StudentListItem = Pick<
  Student,
  | "id"
  | "name"
  | "grade"
  | "classroom"
  | "subjects"
  | "note"
  | "next_text_robot"
  | "next_text_robot_course"
  | "next_text_robot_text"
  | "next_text_programming"
  | "next_text_programming_course"
  | "next_text_programming_text"
>;

type Props = {
  students: StudentListItem[];
  offeredByClassroom: Record<string, CourseSubject[]>;
};

export function StudentListWithBulkDelete({
  students,
  offeredByClassroom,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const allIds = useMemo(() => students.map((s) => s.id), [students]);
  const allSelected =
    students.length > 0 && selectedIds.size === students.length;
  const someSelected = selectedIds.size > 0;

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  }

  return (
    <div className="space-y-3">
      <form
        action={deleteStudentsBulk}
        onSubmit={(e) => {
          if (selectedIds.size === 0) {
            e.preventDefault();
            window.alert("削除する生徒を選択してください。");
            return;
          }
          const n = selectedIds.size;
          const msg =
            n === students.length
              ? `表示中の ${n} 名をすべて削除します。出席予定など関連データも削除されます。この操作は取り消せません。よろしいですか？`
              : `選択した ${n} 名を削除します。出席予定など関連データも削除されます。この操作は取り消せません。よろしいですか？`;
          if (!window.confirm(msg)) {
            e.preventDefault();
          }
        }}
        className="flex flex-wrap items-center gap-2"
      >
        {Array.from(selectedIds).map((id) => (
          <input key={id} type="hidden" name="ids" value={id} />
        ))}
        <button
          type="button"
          onClick={toggleAll}
          className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm px-3 py-1.5"
        >
          {allSelected ? "選択を解除" : "すべて選択"}
        </button>
        <BulkDeleteButton disabled={!someSelected} count={selectedIds.size} />
      </form>

      <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
        {students.map((s) => {
          const checked = selectedIds.has(s.id);
          return (
            <li key={s.id} className="flex items-stretch">
              <label
                className={`flex shrink-0 items-center px-3 cursor-pointer border-r border-slate-100 ${
                  checked ? "bg-rose-50/60" : "bg-slate-50/50 hover:bg-slate-50"
                }`}
                title="一括削除の対象に含める"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleOne(s.id)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                  aria-label={`${s.name} を選択`}
                />
              </label>
              <Link
                href={`/students/${s.id}`}
                className={`flex flex-1 items-start justify-between gap-3 px-4 py-3 min-w-0 hover:bg-slate-50 ${
                  checked ? "bg-rose-50/30" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{s.name}</p>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {s.grade}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <ClassroomBadge classroom={s.classroom} />
                    {s.subjects?.map((sub) => (
                      <SubjectChip key={sub} subject={sub} />
                    ))}
                  </div>
                  <StudentTextInfoSummary
                    classroom={s.classroom}
                    offeredSubjects={
                      s.classroom
                        ? offeredByClassroom[s.classroom] ?? null
                        : null
                    }
                    subjects={s.subjects}
                    next_text_robot={s.next_text_robot}
                    next_text_robot_course={s.next_text_robot_course ?? null}
                    next_text_robot_text={s.next_text_robot_text ?? null}
                    next_text_programming={s.next_text_programming}
                    next_text_programming_course={
                      s.next_text_programming_course ?? null
                    }
                    next_text_programming_text={
                      s.next_text_programming_text ?? null
                    }
                  />
                  {s.note ? (
                    <p className="text-xs text-slate-500 truncate mt-1.5">
                      {s.note}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BulkDeleteButton({
  disabled,
  count,
}: {
  disabled: boolean;
  count: number;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-3 py-1.5"
    >
      {pending
        ? "削除中…"
        : count > 0
          ? `選択した ${count} 名を削除`
          : "選択して削除"}
    </button>
  );
}
