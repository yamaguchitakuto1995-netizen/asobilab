import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { PeriodTimeForm } from "@/components/PeriodTimeForm";
import { getCurrentUser } from "@/lib/auth";
import { createPeriodTime } from "../actions";

export default async function NewPeriodTimePage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/capacities/period-times");

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
        description="振替枠と同じ「教室・曜日・開催週・コマ」に対応づけます。"
      />
      <PeriodTimeForm action={createPeriodTime} submitLabel="追加する" />
    </div>
  );
}
