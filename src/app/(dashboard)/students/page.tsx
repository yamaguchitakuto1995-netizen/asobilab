import Link from "next/link";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { PageHeader } from "@/components/PageHeader";
import { SubjectChip } from "@/components/SubjectChip";
import { createClient } from "@/lib/supabase/server";
import { CLASSROOM_NAMES, CLASSROOMS, type Student } from "@/lib/types";

type SearchParams = Promise<{ q?: string; classroom?: string }>;

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { q = "", classroom = "" } = await searchParams;
  const supabase = await createClient();

  const isUnassigned = classroom === "__none__";
  const validClassroom =
    classroom && (CLASSROOM_NAMES as readonly string[]).includes(classroom)
      ? classroom
      : "";

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
  const exportHref =
    exportParams.size > 0
      ? `/api/export/students?${exportParams.toString()}`
      : "/api/export/students";

  return (
    <div>
      <PageHeader
        title="生徒一覧"
        description="所属教室・名前で絞り込めます。CSV はログイン中のみ取得でき、表示中の条件がそのまま反映されます。"
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
        {CLASSROOMS.map((c) => {
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          params.set("classroom", c.name);
          return (
            <ClassroomChipLink
              key={c.name}
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
          {CLASSROOMS.map((c) => (
            <option key={c.name} value={c.name}>
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
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {students.map((s) => (
            <li key={s.id}>
              <Link
                href={`/students/${s.id}`}
                className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{s.name}</p>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {s.grade}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <ClassroomBadge classroom={s.classroom} />
                    {s.subjects?.map((sub) => (
                      <SubjectChip key={sub} subject={sub} />
                    ))}
                  </div>
                  {s.note ? (
                    <p className="text-xs text-slate-500 truncate mt-1.5">
                      {s.note}
                    </p>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
