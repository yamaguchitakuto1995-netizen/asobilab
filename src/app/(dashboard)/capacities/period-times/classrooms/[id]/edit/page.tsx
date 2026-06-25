import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClassroomForm } from "@/components/ClassroomForm";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ClassroomRecord } from "@/lib/types";
import { deleteClassroom, updateClassroom } from "../../actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function EditClassroomPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    redirect("/login");
  }
  if (!user.isAdmin) {
    redirect("/capacities/period-times");
  }

  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: classroom } = await supabase
    .from("classrooms")
    .select("id, name, subjects, note, sort_order, default_max_students")
    .eq("id", id)
    .maybeSingle();

  if (!classroom) notFound();

  const record: ClassroomRecord = {
    ...(classroom as ClassroomRecord),
    default_max_students:
      typeof (classroom as ClassroomRecord).default_max_students === "number"
        ? (classroom as ClassroomRecord).default_max_students
        : 4,
  };

  return (
    <div className="max-w-lg space-y-4">
      <Link
        href="/capacities/period-times"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← コマの時刻設定に戻る
      </Link>

      <PageHeader
        title="教室の編集"
        description="教室名・開講教科・コマ定員の初期値・メモを変更します。既存の振替枠の定員は「振替枠の設定」で個別に編集できます。"
      />

      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      <ClassroomForm
        action={updateClassroom}
        defaultValue={record}
        submitLabel="変更を保存"
      />

      <section className="border-t border-slate-200 pt-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">教室の削除</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          生徒・振替枠・コマ時刻・授業記録が1件もない教室のみ削除できます。
        </p>
        <ConfirmDeleteForm
          action={deleteClassroom}
          message={`「${record.name}」を削除します。よろしいですか？`}
          buttonLabel="この教室を削除"
          buttonClassName="rounded-lg border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-sm font-medium px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <input type="hidden" name="id" value={record.id} />
        </ConfirmDeleteForm>
      </section>
    </div>
  );
}
