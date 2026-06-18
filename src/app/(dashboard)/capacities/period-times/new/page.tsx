import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PeriodTimeForm } from "@/components/PeriodTimeForm";
import { getCurrentUser } from "@/lib/auth";
import { fetchClassrooms } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import { createPeriodTime } from "../actions";

export default async function NewPeriodTimePage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/capacities/period-times");

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  return (
    <div className="max-w-lg space-y-4">
      <Link
        href="/capacities/period-times"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← 一覧へ
      </Link>
      <PageHeader
        title="コマの時刻を追加"
        description="教室・開催日・コマごとに時間帯を登録します。"
      />
      <PeriodTimeForm
        classrooms={classrooms}
        action={createPeriodTime}
        submitLabel="追加する"
      />
    </div>
  );
}
