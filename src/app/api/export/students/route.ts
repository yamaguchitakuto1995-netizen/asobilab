import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { todayIso } from "@/lib/date";
import { toCsvRow } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { CLASSROOM_NAMES, type Student } from "@/lib/types";

/**
 * ログイン済み講師のみ。生徒の個人情報を含むため URL は共有しないでください。
 * 一覧と同じ検索・教室絞り込みクエリを反映します（q, classroom）。
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (user.accountRole !== "staff") {
    return NextResponse.json(
      { error: "エクスポートは職員のみ利用できます。" },
      { status: 403 }
    );
  }

  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const classroomParam = searchParams.get("classroom") ?? "";
  const isUnassigned = classroomParam === "__none__";
  const validClassroom =
    classroomParam &&
    (CLASSROOM_NAMES as readonly string[]).includes(classroomParam)
      ? classroomParam
      : "";

  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("id, name, grade, classroom, subjects, note, created_at")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  if (validClassroom) {
    query = query.eq("classroom", validClassroom);
  } else if (isUnassigned) {
    query = query.is("classroom", null);
  }

  const { data: students, error } = await query.returns<
    Pick<
      Student,
      "id" | "name" | "grade" | "classroom" | "subjects" | "note" | "created_at"
    >[]
  >();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const header = [
    "id",
    "氏名",
    "学年",
    "所属教室",
    "受講教科",
    "メモ",
    "登録日時_UTC",
  ];
  const lines: string[] = [toCsvRow(header)];

  for (const s of students ?? []) {
    let created = "";
    if (s.created_at) {
      const t = Date.parse(s.created_at);
      created = Number.isNaN(t)
        ? s.created_at
        : new Date(t).toISOString().slice(0, 19).replace("T", " ");
    }
    lines.push(
      toCsvRow([
        s.id,
        s.name,
        s.grade,
        s.classroom ?? "",
        (s.subjects ?? []).join("; "),
        s.note ?? "",
        created,
      ])
    );
  }

  const bom = "\uFEFF";
  const body = bom + lines.join("\r\n");
  const dateStr = todayIso();
  const filename = `students_export_${dateStr}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
