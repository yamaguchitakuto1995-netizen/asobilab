import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { StudentListWithBulkDelete } from "@/components/StudentListWithBulkDelete";
import { getCurrentUser } from "@/lib/auth";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import { createClient } from "@/lib/supabase/server";
import { STUDENT_CSV_HEADER } from "@/lib/studentCsvImport";
import { type Student } from "@/lib/types";
import { importStudentsCsv } from "./actions";

type SearchParams = Promise<{
  q?: string;
  classroom?: string;
  error?: string;
  imported?: string;
  csv_updated?: string;
  classroom_created?: string;
  bulk_deleted?: string;
}>;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const {
    q = "",
    classroom = "",
    error: pageError,
    imported,
    csv_updated,
    bulk_deleted,
  } = await searchParams;
  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);

  const isUnassigned = classroom === "__none__";
  const validClassroom =
    classroom && isKnownClassroom(classroom, classrooms) ? classroom : "";

  let query = supabase
    .from("students")
    .select("*")
    .order("created_at", { ascending: false });

  if (q.trim()) {
    query = query.ilike("name", `%${q.trim()}%`);
  }
  if (validClassroom) {
    query = query.eq("classroom", validClassroom);
  } else if (isUnassigned) {
    query = query.is("classroom", null);
  }

  const { data: students, error } = await query.returns<Student[]>();

  // 教室別の登録数 (絞り込み解除前の全件で数える)
  const { data: allForCount } = await supabase
    .from("students")
    .select("classroom")
    .returns<Pick<Student, "classroom">[]>();
  const counts = new Map<string, number>();
  for (const s of allForCount ?? []) {
    if (!s.classroom) continue;
    counts.set(s.classroom, (counts.get(s.classroom) ?? 0) + 1);
  }
  const unassignedCount =
    (allForCount ?? []).filter((s) => !s.classroom).length;

  const exportParams = new URLSearchParams();
  if (q.trim()) exportParams.set("q", q.trim());
  if (validClassroom) exportParams.set("classroom", validClassroom);
  else if (isUnassigned) exportParams.set("classroom", "__none__");
  const offeredByClassroom = new Map(
    classrooms.map((c) => [c.name, c.subjects] as const)
  );
  const exportHref =
    exportParams.size > 0
      ? `/api/export/students?${exportParams.toString()}`
      : "/api/export/students";

  return (
    <div>
      <PageHeader
        title="生徒一覧"
        description="所属教室・名前で絞り込めます。チェックして一括削除、または CSV で一括登録・更新ができます。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={exportHref}
              className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2"
            >
              CSV エクスポート
            </a>
            <Link
              href="/students/new"
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
            >
              ＋ 新規生徒
            </Link>
          </div>
        }
      />

      {pageError ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 whitespace-pre-wrap mb-4">
          {decodeURIComponent(pageError)}
        </p>
      ) : null}
      {imported || csv_updated ? (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 space-y-1 mb-4">
          {imported ? <p>新規 {imported} 件を登録しました。</p> : null}
          {csv_updated ? <p>既存 {csv_updated} 件を更新しました。</p> : null}
        </div>
      ) : null}
      {bulk_deleted ? (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-4">
          {bulk_deleted} 名を削除しました。
        </p>
      ) : null}

      <p className="text-[11px] text-slate-400 mb-3">
        CSV には氏名・学年・メモなどが含まれます。Google
        スプレッドシートへ貼る場合も、共有範囲にご注意ください。
      </p>

      {/* 教室別クイックフィルタ (チップ) */}
      <div className="mb-3 -mx-1 flex flex-wrap gap-1.5">
        <ClassroomChipLink
          label="すべて"
          count={allForCount?.length ?? 0}
          href={q ? `/students?q=${encodeURIComponent(q)}` : "/students"}
          active={!validClassroom}
        />
        {classrooms.map((c) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          params.set("classroom", c.name);
          return (
            <ClassroomChipLink
              key={c.id}
              label={c.name}
              count={counts.get(c.name) ?? 0}
              href={`/students?${params.toString()}`}
              active={validClassroom === c.name}
            />
          );
        })}
        {unassignedCount > 0 ? (
          (() => {
            const params = new URLSearchParams();
            if (q) params.set("q", q);
            params.set("classroom", "__none__");
            return (
              <ClassroomChipLink
                label="教室未設定"
                count={unassignedCount}
                href={`/students?${params.toString()}`}
                active={isUnassigned}
                muted={!isUnassigned}
              />
            );
          })()
        ) : null}
      </div>

      <form className="mb-4 flex flex-col sm:flex-row gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="名前で検索"
          className="w-full sm:w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <select
          name="classroom"
          defaultValue={validClassroom}
          className="w-full sm:w-72 rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        >
          <option value="">所属教室で絞り込み</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-2 text-sm"
        >
          絞り込み
        </button>
        {q || validClassroom || isUnassigned ? (
          <Link
            href="/students"
            className="shrink-0 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 px-3 py-2 text-sm"
          >
            クリア
          </Link>
        ) : null}
      </form>

      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error.message}
        </p>
      ) : null}

      {students && students.length > 0 ? (
        <StudentListWithBulkDelete
          students={students}
          offeredByClassroom={Object.fromEntries(offeredByClassroom)}
        />
      ) : (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center">
          <p className="text-sm text-slate-500">
            {q || validClassroom || isUnassigned
              ? "該当する生徒が見つかりませんでした。"
              : "まだ生徒が登録されていません。"}
          </p>
          {!q && !validClassroom && !isUnassigned ? (
            <Link
              href="/students/new"
              className="inline-block mt-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
            >
              最初の生徒を登録
            </Link>
          ) : null}
        </div>
      )}

      <section className="mt-10 space-y-3">
        <h2 className="text-base font-semibold">CSV 一括取り込み</h2>
        <div className="text-xs text-slate-600 leading-relaxed space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3">
          <p>
            <span className="font-semibold text-slate-700">手順:</span>{" "}
            ヘッダー行を含む CSV を貼り付けて「取り込む」（ヘッダーなしのスプレッドシート形式でも可）。{" "}
            <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
              student_id
            </code>{" "}
            が空なら新規、UUID があれば更新します。
          </p>
          <p>
            <span className="font-semibold text-slate-700">レギュラー出席コマ:</span>{" "}
            週グループは{" "}
            <span className="font-medium">第1/3</span> または{" "}
            <span className="font-medium">第2/4</span>。曜日は「月」「土曜」など。コマは 1〜10。
            受講教科ごとにコース・テキスト名・コース開始月（YYYY-MM）も指定します。
          </p>
          <p>
            <span className="font-semibold text-slate-700">任意項目:</span>{" "}
            ポータルID・誕生日（MMDD）・飛び級予定月・休会/退会・スクラッチログインなど。空欄は未設定です。
          </p>
          <p>
            ヘッダー例:{" "}
            <code className="text-[11px] bg-white px-1 rounded border border-slate-200 break-all">
              {STUDENT_CSV_HEADER}
            </code>
          </p>
          <p>
            サンプル:{" "}
            <code className="text-[11px] bg-white px-1 rounded border border-slate-200">
              samples/students_import_sample.csv
            </code>
          </p>
        </div>
        <form action={importStudentsCsv} className="space-y-2">
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
    </div>
  );
}

function ClassroomChipLink({
  label,
  count,
  href,
  active,
  muted,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
  muted?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition ${
        active
          ? "bg-brand-600 text-white ring-brand-700"
          : muted
            ? "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"
            : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      <span className="truncate max-w-[12rem]">{label}</span>
      <span
        className={`text-[10px] ${
          active ? "text-brand-100" : "text-slate-500"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}
