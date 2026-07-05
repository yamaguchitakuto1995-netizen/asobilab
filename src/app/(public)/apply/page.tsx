import { createClient } from "@/lib/supabase/server";
import { fetchClassroomPeriodTimes } from "@/lib/periodTimes";
import { MakeupApplyFlow } from "./MakeupApplyFlow";

function safeDecode(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const metadata = {
  title: "振替申請 | ASOBI Lab.",
  description: "保護者向け 振替申請フォーム",
};

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ portal_id?: string; birthday?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const periodTimes = await fetchClassroomPeriodTimes(supabase);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          振替申請フォーム
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          生徒IDと誕生日でログインし、振替予定をオンラインで登録いただけます。
        </p>
      </div>
      <MakeupApplyFlow
        periodTimes={periodTimes}
        initialPortalId={safeDecode(sp.portal_id)}
        initialBirthday={safeDecode(sp.birthday)}
      />
    </div>
  );
}
