import Link from "next/link";
import { CapacityForm } from "@/components/CapacityForm";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { PageHeader } from "@/components/PageHeader";
import { SubjectChip } from "@/components/SubjectChip";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { getCurrentUser } from "@/lib/auth";
import { DAYS_OF_WEEK, dayLabel } from "@/lib/days";
import { createClient } from "@/lib/supabase/server";
import { CLASSROOMS, formatWeekOrdinals, type LessonCapacity } from "@/lib/types";
import { createCapacity, deleteCapacity } from "./actions";

type SearchParams = Promise<{ error?: string }>;

export default async function CapacitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  const supabase = await createClient();

  const { data: capacities } = await supabase
    .from("lesson_capacities")
    .select("*")
    .order("classroom", { ascending: true })
    .order("day_of_week", { ascending: true })
    .order("period", { ascending: true })
    .order("subject", { ascending: true })
    .returns<LessonCapacity[]>();

  const isAdmin = user?.isAdmin ?? false;
  const taken = (capacities ?? []).map(
    (c) => `${c.classroom}|${c.day_of_week}|${c.period}|${c.subject}`
  );

  // (教室 → 曜日) でグルーピング
  const grouped = new Map<string, Map<number, LessonCapacity[]>>();
  for (const cap of capacities ?? []) {
    if (!grouped.has(cap.classroom)) grouped.set(cap.classroom, new Map());
    const dayMap = grouped.get(cap.classroom)!;
    if (!dayMap.has(cap.day_of_week)) dayMap.set(cap.day_of_week, []);
    dayMap.get(cap.day_of_week)!.push(cap);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="振替枠の設定"
        description="保護者の振替申請で使われる枠です。**教室・曜日・第◯週・コマ・教科**ごとに最大受け入れ人数を1本設定します（第2・第4週の日曜など）。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/capacities/period-times"
              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2"
            >
              コマ時刻の設定
            </Link>
            <Link
              href="/apply"
              target="_blank"
              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2"
            >
              ↗ 保護者フォームを開く
            </Link>
          </div>
        }
      />

      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      {!isAdmin ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          振替枠の追加・編集・削除は管理者のみ可能です。閲覧のみできます。
        </p>
      ) : null}

      {/* 既存の枠 */}
      <section className="space-y-4">
        <h2 className="text-base font-semibold">登録済みの振替枠</h2>

        {grouped.size === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-sm text-slate-500">
            まだ振替枠が登録されていません。下の「新規追加」から登録してください。
          </div>
        ) : (
          <div className="space-y-4">
            {CLASSROOMS.map((c) => {
              const dayMap = grouped.get(c.name);
              if (!dayMap) return null;
              return (
                <div
                  key={c.name}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                    <ClassroomBadge classroom={c.name} />
                    <span className="text-xs text-slate-500">
                      開講: {c.subjects.join(" / ")}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {DAYS_OF_WEEK.map((d) => {
                      const list = dayMap.get(d.value);
                      if (!list || list.length === 0) return null;
                      return (
                        <div key={d.value} className="px-4 py-3">
                          <div className="text-xs font-semibold text-slate-700 mb-2">
                            {d.long}
                          </div>
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {list.map((cap) => (
                              <li
                                key={cap.id}
                                className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-semibold">
                                      {cap.period}コマ目
                                    </span>
                                    <SubjectChip subject={cap.subject} />
                                    <span className="text-xs font-medium rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">
                                      最大 {cap.max_students} 名
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1">
                                    開催: {formatWeekOrdinals(cap.week_ordinals)}
                                  </p>
                                  {cap.note ? (
                                    <p className="text-xs text-slate-500 mt-1 truncate">
                                      {cap.note}
                                    </p>
                                  ) : null}
                                </div>
                                {isAdmin ? (
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <Link
                                      href={`/capacities/${cap.id}/edit`}
                                      className="text-xs text-brand-600 hover:underline"
                                    >
                                      編集
                                    </Link>
                                    <ConfirmDeleteForm
                                      action={deleteCapacity}
                                      message={`${c.name} ${dayLabel(d.value, "long")} ${cap.period}コマ目 ${cap.subject} の枠を削除します。よろしいですか？`}
                                    >
                                      <input
                                        type="hidden"
                                        name="id"
                                        value={cap.id}
                                      />
                                    </ConfirmDeleteForm>
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 新規追加 */}
      {isAdmin ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">新規追加</h2>
          <CapacityForm
            action={createCapacity}
            takenKeys={taken}
            submitLabel="この枠を追加"
          />
        </section>
      ) : null}
    </div>
  );
}
