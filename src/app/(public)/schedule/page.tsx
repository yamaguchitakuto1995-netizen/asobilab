import { createClient } from "@/lib/supabase/server";
import { fetchClassroomPeriodTimes } from "@/lib/periodTimes";
import { ScheduleFlow } from "./ScheduleFlow";

function safeDecode(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const metadata = {
  title: "授業日一覧 | ASOBI Lab.",
  description: "保護者向け 授業予定の確認",
};

export default async function SchedulePage({
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
          授業日一覧
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          今後の授業予定を確認できます。
        </p>
      </div>
      <ScheduleFlow
        periodTimes={periodTimes}
        initialPortalId={safeDecode(sp.portal_id)}
        initialBirthday={safeDecode(sp.birthday)}
      />
    </div>
  );
}
