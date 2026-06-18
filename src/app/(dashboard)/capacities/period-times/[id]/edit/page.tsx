import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PeriodTimeForm } from "@/components/PeriodTimeForm";
import { getCurrentUser } from "@/lib/auth";
import { fetchClassrooms } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import type { ClassroomPeriodTime } from "@/lib/types";
import { updatePeriodTime } from "../../actions";

type Params = Promise<{ id: string }>;

export default async function EditPeriodTimePage({ params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/capacities/period-times");

  const { id } = await params;
  const supabase = await createClient();
  const [classrooms, { data: row }] = await Promise.all([
    fetchClassrooms(supabase),
    supabase
      .from("classroom_period_times")
      .select("*")
      .eq("id", id)
      .maybeSingle<ClassroomPeriodTime>(),
  ]);

  if (!row) notFound();

  return (
    <div className="max-w-lg space-y-4">
      <Link
        href="/capacities/period-times"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← 一覧へ
      </Link>
      <PageHeader title="コマの時刻を編集" />
      <PeriodTimeForm
        classrooms={classrooms}
        defaultValue={row}
        action={updatePeriodTime}
        submitLabel="保存する"
      />
    </div>
  );
}
