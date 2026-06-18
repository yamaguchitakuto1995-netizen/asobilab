import { createClient } from "@/lib/supabase/server";
import { fetchClassrooms } from "@/lib/classrooms";
import { fetchClassroomPeriodTimes } from "@/lib/periodTimes";
import { MakeupApplyFlow } from "./MakeupApplyFlow";

export const metadata = {
  title: "振替申請 | ASOBI Lab.",
  description: "保護者向け 振替申請フォーム",
};

export default async function ApplyPage() {
  const supabase = await createClient();
  const [periodTimes, classrooms] = await Promise.all([
    fetchClassroomPeriodTimes(supabase),
    fetchClassrooms(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
          振替申請フォーム
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          お子様の振替予定を、空き枠に合わせてオンラインで登録いただけます。
        </p>
      </div>
      <MakeupApplyFlow periodTimes={periodTimes} classrooms={classrooms} />
    </div>
  );
}
