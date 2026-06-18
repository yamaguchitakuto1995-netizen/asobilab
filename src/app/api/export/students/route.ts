import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import { todayIso } from "@/lib/date";
import { toCsvRow } from "@/lib/csv";
import { createClient } from "@/lib/supabase/server";
import { type Student } from "@/lib/types";

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

  const supabase = await createClient();
  const classrooms = await fetchClassrooms(supabase);
  const validClassroom =
    classroomParam && isKnownClassroom(classroomParam, classrooms)
      ? classroomParam
      : "";

  let query = supabase
    .from("students")
    .select(
      "id, name, grade, classroom, subjects, note, next_text_robot, next_text_robot_course, next_text_robot_text, next_text_programming, next_text_programming_course, next_text_programming_text, created_at"
    )
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
      | "id"
      | "name"
      | "grade"
      | "classroom"
      | "subjects"
      | "next_text_robot"
      | "next_text_robot_course"
      | "next_text_robot_text"
      | "next_text_programming"
      | "next_text_programming_course"
      | "next_text_programming_text"
      | "note"
      | "created_at"
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
    "ロボット_コース",
    "ロボット_テキスト名",
    "ロボット_表記",
    "プログラミング_コース",
    "プログラミング_テキスト名",
    "プログラミング_表記",
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
        s.next_text_robot_course ?? "",
        s.next_text_robot_text ?? "",
        s.next_text_robot ?? "",
        s.next_text_programming_course ?? "",
        s.next_text_programming_text ?? "",
        s.next_text_programming ?? "",
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
