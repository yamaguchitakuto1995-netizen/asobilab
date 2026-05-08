import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CapacityForm } from "@/components/CapacityForm";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LessonCapacity } from "@/lib/types";
import { updateCapacity } from "../../actions";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ error?: string }>;

export default async function EditCapacityPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/capacities");

  const supabase = await createClient();
  const { data: capacity } = await supabase
    .from("lesson_capacities")
    .select("*")
    .eq("id", id)
    .maybeSingle<LessonCapacity>();

  if (!capacity) notFound();

  const { data: all } = await supabase
    .from("lesson_capacities")
    .select("classroom, day_of_week, period, subject")
    .returns<Pick<LessonCapacity, "classroom" | "day_of_week" | "period" | "subject">[]>();
  const taken =
    all?.map(
      (c) => `${c.classroom}|${c.day_of_week}|${c.period}|${c.subject}`
    ) ?? [];

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <Link
          href="/capacities"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 振替枠一覧に戻る
        </Link>
      </div>

      <PageHeader title="振替枠を編集" />

      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      <CapacityForm
        defaultValue={capacity}
        action={updateCapacity}
        takenKeys={taken}
        submitLabel="保存する"
      />
    </div>
  );
}
