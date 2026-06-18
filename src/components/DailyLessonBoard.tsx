"use client";

import { useMemo, useState } from "react";
import {
  DailyLessonCarousel,
  type DailyLessonItem,
} from "@/components/DailyLessonCarousel";
import { DailyLessonFilters } from "@/components/DailyLessonFilters";
import {
  classroomNamesInLessons,
  filterAndSortDailyLessons,
  subjectsInLessons,
  toggleSetValue,
} from "@/lib/dailyLessonFilter";
import type { ClassroomPeriodTime, CourseSubject } from "@/lib/types";

type Props = {
  date: string;
  lessons: DailyLessonItem[];
  classroomPeriodTimes?: ClassroomPeriodTime[];
  previousMemos?: Record<string, string | null>;
  /** DB classrooms（sort_order 順） */
  classroomOrderNames: string[];
};

export function DailyLessonBoard({
  date,
  lessons,
  classroomPeriodTimes = [],
  previousMemos = {},
  classroomOrderNames,
}: Props) {
  const [selectedClassrooms, setSelectedClassrooms] = useState<Set<string>>(
    () => new Set()
  );
  const [selectedSubjects, setSelectedSubjects] = useState<Set<CourseSubject>>(
    () => new Set()
  );

  const classroomOrder = useMemo(() => {
    const map = new Map<string, number>();
    classroomOrderNames.forEach((name, i) => map.set(name, i));
    return map;
  }, [classroomOrderNames]);

  const classroomOptions = useMemo(
    () => classroomNamesInLessons(lessons, classroomOrderNames),
    [lessons, classroomOrderNames]
  );

  const subjectOptions = useMemo(() => subjectsInLessons(lessons), [lessons]);

  const filteredLessons = useMemo(
    () =>
      filterAndSortDailyLessons(
        lessons,
        selectedClassrooms,
        selectedSubjects,
        classroomOrder
      ),
    [lessons, selectedClassrooms, selectedSubjects, classroomOrder]
  );

  const hasActiveFilter =
    selectedClassrooms.size > 0 || selectedSubjects.size > 0;

  if (lessons.length === 0) {
    return (
      <DailyLessonCarousel
        date={date}
        lessons={[]}
        classroomPeriodTimes={classroomPeriodTimes}
        previousMemos={previousMemos}
        classroomOrderNames={classroomOrderNames}
      />
    );
  }

  return (
    <div>
      <DailyLessonFilters
        classroomOptions={classroomOptions}
        subjectOptions={subjectOptions}
        selectedClassrooms={selectedClassrooms}
        selectedSubjects={selectedSubjects}
        onToggleClassroom={(name) =>
          setSelectedClassrooms((prev) => toggleSetValue(prev, name))
        }
        onToggleSubject={(subject) =>
          setSelectedSubjects((prev) => toggleSetValue(prev, subject))
        }
        onClear={() => {
          setSelectedClassrooms(new Set());
          setSelectedSubjects(new Set());
        }}
        hasActiveFilter={hasActiveFilter}
      />

      {filteredLessons.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500 mx-4 sm:mx-0">
          選択した条件に該当する授業はありません。フィルターを変更するか「クリア」を押してください。
        </div>
      ) : (
        <DailyLessonCarousel
          date={date}
          lessons={filteredLessons}
          classroomPeriodTimes={classroomPeriodTimes}
          previousMemos={previousMemos}
          classroomOrderNames={classroomOrderNames}
        />
      )}
    </div>
  );
}
