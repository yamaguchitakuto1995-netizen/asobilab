import Link from "next/link";
import { redirect } from "next/navigation";
import { ClassroomForm } from "@/components/ClassroomForm";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { createClassroom } from "../actions";

type SearchParams = Promise<{ error?: string }>;

export default async function NewClassroomPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    redirect("/login");
  }
  if (!user.isAdmin) {
    redirect("/capacities/period-times");
  }

  const { error } = await searchParams;

  return (
    <div className="max-w-lg space-y-4">
      <Link
        href="/capacities/period-times"
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← コマの時刻設定に戻る
      </Link>

      <PageHeader
        title="新規教室の登録"
        description="教室名と開講教科を登録します。登録後は生徒・振替枠・コマ時刻の各画面でこの教室を選べます。"
      />

      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      <ClassroomForm action={createClassroom} />
    </div>
  );
}
