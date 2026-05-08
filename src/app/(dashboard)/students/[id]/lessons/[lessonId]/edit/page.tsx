import Link from "next/link";
import { notFound } from "next/navigation";
import { LessonForm } from "@/components/LessonForm";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { fetchClassroomPeriodTimes } from "@/lib/periodTimes";
import { createClient } from "@/lib/supabase/server";
import type { Lesson, Student } from "@/lib/types";
import { updateLesson } from "../../actions";

type Params = Promise<{ id: string; lessonId: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function EditLessonPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id, lessonId } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();

  const [{ data: student }, { data: lesson }, periodTimes] = await Promise.all([
    supabase
      .from("students")
      .select("id, name, grade, subjects, classroom")
      .eq("id", id)
      .maybeSingle<
        Pick<Student, "id" | "name" | "grade" | "subjects" | "classroom">
      >(),
    supabase
      .from("lessons")
      .select("*")
      .eq("id", lessonId)
      .maybeSingle<Lesson>(),
    fetchClassroomPeriodTimes(supabase),
  ]);

  if (!student || !lesson) notFound();

  const canEdit =
    user !== null && (lesson.teacher_id === user.id || user.isAdmin);

  if (!canEdit) {
    return (
      <div className="max-w-lg">
        <PageHeader title="編集できません" />
        <p className="text-sm text-slate-600">
          この授業記録を編集する権限がありません。記録した講師か、管理者のみ編集できます。
        </p>
        <div className="mt-4">
          <Link
            href={`/students/${student.id}`}
            className="text-sm text-brand-600 hover:underline"
          >
            ← 生徒詳細に戻る
          </Link>
        </div>
      </div>
    );
  }

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
        title="授業を編集"
        description={`${student.name} (${student.grade}) の授業`}
      />

      <LessonForm
        studentId={student.id}
        lessonId={lesson.id}
        cancelHref={`/students/${student.id}`}
        action={updateLesson}
        studentSubjects={student.subjects ?? []}
        studentClassroom={student.classroom}
        classroomPeriodTimes={periodTimes}
        defaultValues={{
          lessonDate: lesson.lesson_date,
          period: lesson.period,
          attendance: lesson.attendance,
          subject: lesson.subject,
          textbook: lesson.textbook,
          status: lesson.status,
          textMemo: lesson.text_memo,
        }}
        submitLabel="保存する"
        error={error}
      />
    </div>
  );
}
