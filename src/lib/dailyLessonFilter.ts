import type { DailyLessonItem } from "@/components/DailyLessonCarousel";
import {
  COURSE_SUBJECTS,
  effectiveLessonClassroom,
  type CourseSubject,
} from "@/lib/types";

export function lessonClassroomForFilter(lesson: DailyLessonItem): string | null {
  return effectiveLessonClassroom(lesson, lesson.students?.classroom ?? null);
}

/** その日の授業に登場する教室名（DB の sort_order 順、未知の教室は末尾） */
export function classroomNamesInLessons(
  lessons: DailyLessonItem[],
  orderedNames: readonly string[]
): string[] {
  const present = new Set<string>();
  for (const l of lessons) {
    const name = lessonClassroomForFilter(l);
    if (name) present.add(name);
  }
  const sorted = orderedNames.filter((n) => present.has(n));
  for (const name of present) {
    if (!sorted.includes(name)) sorted.push(name);
  }
  return sorted;
}

export function subjectsInLessons(lessons: DailyLessonItem[]): CourseSubject[] {
  const present = new Set<string>();
  for (const l of lessons) {
    if (l.subject) present.add(l.subject);
  }
  return COURSE_SUBJECTS.filter((s) => present.has(s));
}

function subjectSortIndex(subject: string | null | undefined): number {
  if (!subject) return 999;
  const i = COURSE_SUBJECTS.indexOf(subject as CourseSubject);
  return i === -1 ? 998 : i;
}

export function filterAndSortDailyLessons(
  lessons: DailyLessonItem[],
  selectedClassrooms: ReadonlySet<string>,
  selectedSubjects: ReadonlySet<string>,
  classroomOrder: ReadonlyMap<string, number>
): DailyLessonItem[] {
  return lessons
    .filter((l) => {
      const classroom = lessonClassroomForFilter(l);
      const classroomOk =
        selectedClassrooms.size === 0 ||
        (classroom != null && selectedClassrooms.has(classroom));
      const subjectOk =
        selectedSubjects.size === 0 ||
        (l.subject != null && selectedSubjects.has(l.subject));
      return classroomOk && subjectOk;
    })
    .sort((a, b) => {
      const ca = lessonClassroomForFilter(a) ?? "";
      const cb = lessonClassroomForFilter(b) ?? "";
      const orderA = classroomOrder.get(ca) ?? 9999;
      const orderB = classroomOrder.get(cb) ?? 9999;
      if (orderA !== orderB) return orderA - orderB;
      if (ca !== cb) return ca.localeCompare(cb, "ja");

      const subDiff =
        subjectSortIndex(a.subject) - subjectSortIndex(b.subject);
      if (subDiff !== 0) return subDiff;

      const nameA = a.students?.name ?? "";
      const nameB = b.students?.name ?? "";
      return nameA.localeCompare(nameB, "ja");
    });
}

export function toggleSetValue<T extends string>(
  prev: ReadonlySet<T>,
  value: T
): Set<T> {
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export type DailyLessonSegment = {
  classroom: string | null;
  subject: string | null;
  lessons: DailyLessonItem[];
};

function segmentKey(classroom: string | null, subject: string | null): string {
  return `${classroom ?? "\0"}\x01${subject ?? "\0"}`;
}

/** 教室×教科ごとに分割（同日に複数会場・教科があるとき縦に並べる） */
export function groupLessonsByClassroomSubject(
  lessons: DailyLessonItem[],
  classroomOrder: ReadonlyMap<string, number>
): DailyLessonSegment[] {
  const map = new Map<string, DailyLessonSegment>();
  for (const l of lessons) {
    const classroom = lessonClassroomForFilter(l);
    const subject = l.subject ?? null;
    const key = segmentKey(classroom, subject);
    const seg = map.get(key);
    if (seg) seg.lessons.push(l);
    else map.set(key, { classroom, subject, lessons: [l] });
  }

  return Array.from(map.values()).sort((a, b) => {
    const orderA = a.classroom ? (classroomOrder.get(a.classroom) ?? 9999) : 9999;
    const orderB = b.classroom ? (classroomOrder.get(b.classroom) ?? 9999) : 9999;
    if (orderA !== orderB) return orderA - orderB;

    const ca = a.classroom ?? "";
    const cb = b.classroom ?? "";
    if (ca !== cb) return ca.localeCompare(cb, "ja");

    return subjectSortIndex(a.subject) - subjectSortIndex(b.subject);
  });
}

/** コマ（period）ごとにまとめる */
export function groupLessonsByPeriod(
  lessons: DailyLessonItem[]
): [number | null, DailyLessonItem[]][] {
  const map = new Map<number | null, DailyLessonItem[]>();
  for (const l of lessons) {
    const key = l.period ?? null;
    const arr = map.get(key) ?? [];
    arr.push(l);
    map.set(key, arr);
  }
  return Array.from(map.entries()).sort(([a], [b]) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a - b;
  });
}
