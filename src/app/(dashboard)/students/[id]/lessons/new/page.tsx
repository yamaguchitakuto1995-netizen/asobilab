import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonForm } from "@/components/LessonForm";
import { PageHeader } from "@/components/PageHeader";
import { StudentTextInfoSection } from "@/components/StudentTextInfo";
import { fetchClassrooms } from "@/lib/classrooms";
import { fetchClassroomPeriodTimes } from "@/lib/periodTimes";
import { createClient } from "@/lib/supabase/server";
import type { Student } from "@/lib/types";
import { createLesson } from "./actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function NewLessonPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: student }, periodTimes, classrooms] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, name, grade, subjects, classroom, next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text"
      )
      .eq("id", id)
      .maybeSingle<
        Pick<
          Student,
          | "id"
          | "name"
          | "grade"
          | "subjects"
          | "classroom"
          | "next_text_robot"
          | "next_text_robot_course"
          | "next_text_robot_text"
          | "next_text_programming"
          | "next_text_programming_course"
          | "next_text_programming_text"
        >
      >(),
    fetchClassroomPeriodTimes(supabase),
    fetchClassrooms(supabase),
  ]);

  if (!student) notFound();

  return (
    <div className="max-w-lg">
      <div className="mb-2">
        <Link
          href={`/students/${student.id}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← {student.name} さんへ戻る
        </Link>
      </div>

      <PageHeader
        title="授業を記録"
        description={`${student.name} (${student.grade}) の授業`}
      />

      <StudentTextInfoSection
        subjects={student.subjects}
        next_text_robot={student.next_text_robot}
        next_text_robot_course={student.next_text_robot_course ?? null}
        next_text_robot_text={student.next_text_robot_text ?? null}
        next_text_programming={student.next_text_programming}
        next_text_programming_course={
          student.next_text_programming_course ?? null
        }
        next_text_programming_text={
          student.next_text_programming_text ?? null
        }
        editHref={`/students/${student.id}/edit`}
      />

      <LessonForm
        studentId={student.id}
        cancelHref={`/students/${student.id}`}
        action={createLesson}
        studentSubjects={student.subjects ?? []}
        studentClassroom={student.classroom}
        classrooms={classrooms}
        classroomPeriodTimes={periodTimes}
        submitLabel="保存する"
        error={error}
      />
    </div>
  );
}
