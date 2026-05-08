import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import {
  fetchClassroomPeriodTimes,
  formatTimeRange,
  periodTimeSlotLabel,
} from "@/lib/periodTimes";
import { createClient } from "@/lib/supabase/server";
import {
  deletePeriodTime,
  importPeriodTimesCsv,
} from "./actions";

type SearchParams = Promise<{
  error?: string;
  imported?: string;
}>;

export default async function PeriodTimesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user || user.accountRole !== "staff") {
    redirect("/login");
  }

  const sp = await searchParams;
  const supabase = await createClient();
  const rows = await fetchClassroomPeriodTimes(supabase);

  const sorted = [...rows].sort((a, b) => {
    if (a.lesson_date !== b.lesson_date)
      return a.lesson_date.localeCompare(b.lesson_date);
    if (a.classroom !== b.classroom) return a.classroom.localeCompare(b.classroom);
    if (a.period !== b.period) return a.period - b.period;
    return (a.subject ?? "").localeCompare(b.subject ?? "");
  });

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <Link
          href="/capacities"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← 振替枠の設定に戻る
        </Link>
      </div>

      <PageHeader
        title="コマの時刻設定"
        description="教室・開催日（暦日）・コマ番号ごとに、画面に表示する時間帯（例: 9:00〜10:30）を登録します。「第◯週」ではなく実際の日付で指定するため、祝日のずれやイレギュラーな開催にも合わせやすくなっています。同じ定例でも曜日ごとに日付が違えば、日付ごとに行を追加してください。"
      />

      {sp.error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}
      {sp.imported ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {decodeURIComponent(sp.imported)} 件を取り込みました。
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/capacities/period-times/new"
          className={`rounded-lg text-sm font-medium px-3 py-2 ${
            user.isAdmin
              ? "bg-brand-600 hover:bg-brand-700 text-white"
              : "bg-slate-100 text-slate-400 cursor-not-allowed pointer-events-none"
          }`}
        >
          新規追加
        </Link>
      </div>

      {!user.isAdmin ? (
        <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          時刻の追加・編集・削除・CSV取り込みは管理者のみ実行できます。
        </p>
      ) : null}

      <section>
        <h2 className="text-base font-semibold mb-3">登録済みの時刻</h2>
        {sorted.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-500">
            まだ登録がありません。管理者が「新規追加」するか、下の CSV
            で一括取り込みしてください。
          </div>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {sorted.map((row) => (
              <li
                key={row.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 text-sm">
                    {periodTimeSlotLabel(row)}
                  </p>
                  <p className="text-sm text-brand-800 mt-0.5">
                    {formatTimeRange(row.start_time, row.end_time)}
                  </p>
                  {row.note ? (
                    <p className="text-xs text-slate-500 mt-1">{row.note}</p>
                  ) : null}
                </div>
                {user.isAdmin ? (
                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      href={`/capacities/period-times/${row.id}/edit`}
                      className="text-sm text-brand-600 hover:underline"
                    >
                      編集
                    </Link>
                    <ConfirmDeleteForm
                      action={deletePeriodTime}
                      message="この時刻設定を削除しますか？"
                      buttonClassName="text-sm text-rose-600 hover:underline disabled:opacity-50"
                    >
                      <input type="hidden" name="id" value={row.id} />
                    </ConfirmDeleteForm>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {user.isAdmin ? (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">CSV 一括取り込み</h2>
          <div className="text-xs text-slate-600 leading-relaxed space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
            <p>
              <span className="font-semibold text-slate-700">手順:</span>{" "}
              Excel やメモ帳で CSV を作成 → ファイル全体をコピー → 下の欄に貼り付け →
              「取り込む」。1行目は必ず列名のヘッダーにしてください。
            </p>
            <p>
              <span className="font-semibold text-slate-700">文字コード:</span>{" "}
              UTF-8（Excel なら「CSV UTF-8（コンマ区切り）(.csv)」で保存すると文字化けしにくいです）。
            </p>
            <p>
              <span className="font-semibold text-slate-700">列（1行目・英語小文字）:</span>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-0.5">
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  classroom
                </code>{" "}
                教室名（アプリの選択肢と{" "}
                <span className="font-medium">完全一致</span>）
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  lesson_date
                </code>{" "}
                開催日（<span className="font-medium">YYYY-MM-DD</span>
                。そのコマが実際に行われる暦日）
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  period
                </code>{" "}
                コマ番号（1〜10 の整数）
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  subject
                </code>{" "}
                任意。「プログラミング」「ロボット」または{" "}
                <span className="font-medium">空欄＝全教科共通の時刻</span>
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  start_time
                </code>{" "}
                /{" "}
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  end_time
                </code>{" "}
                <span className="font-medium">9:00</span> または{" "}
                <span className="font-medium">09:00</span>（秒は任意）
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  note
                </code>{" "}
                任意・メモ
              </li>
            </ul>
            <p className="text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2 py-2">
              <span className="font-semibold">注意:</span>{" "}
              各セルにカンマを含めないでください（カンマ区切りの単純パースのため、カンマ入りの値は行全体がずれます）。
            </p>
            <p>
              ヘッダー例:{" "}
              <code className="text-[11px] bg-white px-1 rounded border border-slate-200 break-all">
                classroom,lesson_date,period,subject,start_time,end_time,note
              </code>
            </p>
            <p>
              サンプルファイル: リポジトリの{" "}
              <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                samples/period_times_import_sample.csv
              </code>{" "}
              を開いてそのままコピーできます。
            </p>
            <p className="text-slate-500">
              生徒・授業の CSV（
              <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                samples/students_import_sample.csv
              </code>{" "}
              など）は、現状アプリからの取り込みはなく、SQL や自作スクリプト用の列例です。
            </p>
          </div>
          <form action={importPeriodTimesCsv} className="space-y-2">
            <textarea
              name="csv"
              rows={8}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="ヘッダー行を含む CSV を貼り付け"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-4 py-2"
            >
              取り込む
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
