import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { fetchClassrooms } from "@/lib/classrooms";
import {
  fetchClassroomPeriodTimes,
  formatTimeRange,
  periodTimeSlotLabel,
} from "@/lib/periodTimes";
import { createClient } from "@/lib/supabase/server";
import {
  deletePeriodTime,
  importPeriodTimesCsv,
  resyncScheduledLessonsFromPeriodTimes,
} from "./actions";

type SearchParams = Promise<{
  error?: string;
  imported?: string;
  updated?: string;
  scheduled?: string;
  capacities?: string;
  resynced?: string;
  classroom_created?: string;
  csv_dupes?: string;
  overwrites?: string;
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
  const [rows, classrooms] = await Promise.all([
    fetchClassroomPeriodTimes(supabase),
    fetchClassrooms(supabase),
  ]);

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
        description="教室・開催日（暦日）・コマ番号ごとに時間帯を登録します。登録すると、同じ教室・曜日・コマの「レギュラー出席コマ」を持つ生徒に、その日の出席予定が自動で追加されます。"
      />

      {sp.error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
          {decodeURIComponent(sp.error)}
        </p>
      ) : null}
      {sp.imported || sp.updated || sp.scheduled || sp.capacities || sp.resynced || sp.classroom_created ? (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 space-y-1">
          {sp.classroom_created ? (
            <p>
              教室「{decodeURIComponent(sp.classroom_created)}」を登録しました。
            </p>
          ) : null}
          {sp.imported ? (
            <p>新規 {decodeURIComponent(sp.imported)} 件を登録しました。</p>
          ) : null}
          {sp.updated ? (
            <p>既存 {decodeURIComponent(sp.updated)} 件を上書きしました。</p>
          ) : null}
          {sp.scheduled ? (
            <p>
              レギュラー出席コマの生徒に出席予定を{" "}
              {decodeURIComponent(sp.scheduled)} 件追加しました。
            </p>
          ) : null}
          {sp.capacities ? (
            <p>
              未登録のレギュラー振替枠を{" "}
              {decodeURIComponent(sp.capacities)} 件自動作成しました。
            </p>
          ) : null}
          {sp.resynced ? (
            <p>
              出席予定を一括再同期しました（{decodeURIComponent(sp.resynced)}{" "}
              件）。
            </p>
          ) : null}
        </div>
      ) : null}
      {sp.csv_dupes ? (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="font-semibold mb-1">CSV 内の重複（最後の行を採用）</p>
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">
            {sp.csv_dupes}
          </pre>
        </div>
      ) : null}
      {sp.overwrites ? (
        <div className="text-sm text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
          <p className="font-semibold mb-1">上書きした既存データ</p>
          <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed">
            {sp.overwrites}
          </pre>
        </div>
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
        {user.isAdmin ? (
          <Link
            href="/capacities/period-times/classrooms/new"
            className="rounded-lg text-sm font-medium px-3 py-2 border border-brand-300 bg-brand-50 hover:bg-brand-100 text-brand-800"
          >
            新規教室の登録
          </Link>
        ) : null}
        {user.isAdmin ? (
          <form action={resyncScheduledLessonsFromPeriodTimes}>
            <button
              type="submit"
              className="rounded-lg text-sm font-medium px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700"
            >
              出席予定を一括再同期
            </button>
          </form>
        ) : null}
      </div>

      {!user.isAdmin ? (
        <p className="text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          時刻の追加・編集・削除・CSV取り込みは管理者のみ実行できます。
        </p>
      ) : null}

      <section>
        <h2 className="text-base font-semibold mb-3">登録済みの教室</h2>
        {classrooms.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-sm text-slate-500">
            教室が未登録です。管理者が「新規教室の登録」から追加してください。
          </div>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {classrooms.map((c) => (
              <li key={c.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900 text-sm">{c.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    開講: {c.subjects.join(" / ")}
                  </p>
                  {c.note ? (
                    <p className="text-xs text-slate-400 mt-1">{c.note}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
              Excel から表をそのままコピーして貼り付けても構いません（タブ区切り）。
              保存してから貼る場合は UTF-8 の CSV 推奨。1行目は必ず列名のヘッダーにしてください。
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
                開催日（<span className="font-medium">YYYY-MM-DD</span> または
                Excel の <span className="font-medium">2026/5/10</span> 形式。暦日）
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  period
                </code>{" "}
                コマ番号（1〜10 の整数）
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  regular_week_group
                </code>{" "}
                レギュラー出席コマの週グループ（
                <span className="font-medium">1-3</span> または{" "}
                <span className="font-medium">2-4</span>。第1・3週 / 第2・4週 も可）
              </li>
              <li>
                <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
                  regular_day_of_week
                </code>{" "}
                レギュラー出席コマの曜日（0=日 … 6=土、または「月曜」など）
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
            <p className="text-sky-900 bg-sky-50 border border-sky-100 rounded-lg px-2 py-2">
              <span className="font-semibold">出席予定の連動:</span>{" "}
              取り込み後、各生徒の「レギュラー出席コマ」と一致する行について、該当生徒の出席予定が自動追加されます。未登録の振替枠は保存時に自動作成されます。
            </p>
            <p className="text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2 py-2">
              <span className="font-semibold">重複時:</span>{" "}
              同じ「教室・開催日・コマ・教科」の行が CSV 内に複数ある場合は
              <span className="font-medium">最後の行</span>
              を採用し、どの行が重複したかを取り込み後に表示します。既に登録済みの同じキーは
              <span className="font-medium">上書き更新</span>
              します（時刻・メモを CSV の内容に置き換え）。
            </p>
            <p className="text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-2 py-2">
              <span className="font-semibold">注意:</span>{" "}
              各セルにカンマを含めないでください（カンマ区切りの単純パースのため、カンマ入りの値は行全体がずれます）。
            </p>
            <p>
              ヘッダー例:{" "}
              <code className="text-[11px] bg-white px-1 rounded border border-slate-200 break-all">
                classroom,lesson_date,period,regular_week_group,regular_day_of_week,subject,start_time,end_time,note
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
