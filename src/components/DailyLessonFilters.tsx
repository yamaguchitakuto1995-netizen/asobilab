"use client";

import { classroomBadgeClass, type CourseSubject } from "@/lib/types";

type Props = {
  classroomOptions: string[];
  subjectOptions: CourseSubject[];
  selectedClassrooms: ReadonlySet<string>;
  selectedSubjects: ReadonlySet<string>;
  onToggleClassroom: (name: string) => void;
  onToggleSubject: (subject: CourseSubject) => void;
  onClear: () => void;
  hasActiveFilter: boolean;
};

const SUBJECT_ACTIVE: Record<CourseSubject, string> = {
  ロボット: "bg-violet-600 text-white ring-violet-700/30",
  プログラミング: "bg-sky-600 text-white ring-sky-700/30",
};

const SUBJECT_INACTIVE: Record<CourseSubject, string> = {
  ロボット: "bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100",
  プログラミング:
    "bg-sky-50 text-sky-800 ring-sky-200 hover:bg-sky-100",
};

export function DailyLessonFilters({
  classroomOptions,
  subjectOptions,
  selectedClassrooms,
  selectedSubjects,
  onToggleClassroom,
  onToggleSubject,
  onClear,
  hasActiveFilter,
}: Props) {
  if (classroomOptions.length === 0 && subjectOptions.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 mx-4 sm:mx-0 space-y-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:px-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500 leading-relaxed">
          教室・教科をタップして絞り込み（複数選択可）。未選択の項目はすべて表示します。
        </p>
        {hasActiveFilter ? (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 text-xs font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
          >
            クリア
          </button>
        ) : null}
      </div>

      {classroomOptions.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">教室</p>
          <div className="flex flex-wrap gap-1.5">
            {classroomOptions.map((name) => {
              const active = selectedClassrooms.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggleClassroom(name)}
                  className={`
                    inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors
                    ${
                      active
                        ? `${classroomBadgeClass(name)} ring-2 ring-offset-1 ring-brand-500/40`
                        : `${classroomBadgeClass(name)} opacity-60 hover:opacity-100`
                    }
                  `}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {subjectOptions.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5">教科</p>
          <div className="flex flex-wrap gap-1.5">
            {subjectOptions.map((subject) => {
              const active = selectedSubjects.has(subject);
              return (
                <button
                  key={subject}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggleSubject(subject)}
                  className={`
                    inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors
                    ${active ? SUBJECT_ACTIVE[subject] : SUBJECT_INACTIVE[subject]}
                  `}
                >
                  {subject}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
