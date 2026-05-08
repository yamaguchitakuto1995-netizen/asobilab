import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonForm } from "@/components/LessonForm";
import { PageHeader } from "@/components/PageHeader";
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

  const [{ data: student }, periodTimes] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, grade, subjects, classroom")
      .eq("id", id)
      .maybeSingle<
        Pick<Student, "id" | "name" | "grade" | "subjects" | "classroom">
      >(),
    fetchClassroomPeriodTimes(supabase),
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

      <LessonForm
        studentId={student.id}
        cancelHref={`/students/${student.id}`}
        action={createLesson}
        studentSubjects={student.subjects ?? []}
        studentClassroom={student.classroom}
        classroomPeriodTimes={periodTimes}
        submitLabel="保存する"
        error={error}
      />
    </div>
  );
}
