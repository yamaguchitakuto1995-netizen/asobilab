import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchClassrooms, isKnownClassroom } from "@/lib/classrooms";
import { todayIso } from "@/lib/date";
import { toCsvRow } from "@/lib/csv";
import { dayLabel } from "@/lib/days";
import {
  capacityToRegularSlotParts,
} from "@/lib/regularSlot";
import { createClient } from "@/lib/supabase/server";
import { STUDENT_CSV_HEADER } from "@/lib/studentCsvImport";
import { type LessonCapacity, type Student } from "@/lib/types";

type ExportStudent = Pick<
  Student,
  | "id"
  | "name"
  | "name_kana"
  | "grade"
  | "classroom"
  | "subjects"
  | "portal_id"
  | "birthday"
  | "enrollment_robot_capacity_id"
  | "enrollment_prog_capacity_id"
  | "next_text_robot_course"
  | "next_text_robot_text"
  | "next_text_programming_course"
  | "next_text_programming_text"
  | "course_start_robot_ym"
  | "course_start_programming_ym"
  | "promotion_scheduled_ym"
  | "scratch_login_id"
  | "scratch_login_pass"
  | "minecraft_login"
  | "leave_from_ym"
  | "leave_until_ym"
  | "withdrawal_until_ym"
  | "persistent_memo"
  | "note"
>;

function weekGroupLabel(id: "1-3" | "2-4"): string {
  if (id === "1-3") return "第1/3";
  return "第2/4";
}

function slotCells(
  capacityId: string | null | undefined,
  capacityById: Map<string, LessonCapacity>
): [string, string, string] {
  if (!capacityId) return ["", "", ""];
  const parts = capacityToRegularSlotParts(capacityById.get(capacityId));
  if (!parts) return ["", "", ""];
  return [
    weekGroupLabel(parts.weekGroupId),
    dayLabel(parts.dayOfWeek),
    String(parts.period),
  ];
}

/**
 * ログイン済み講師のみ。生徒の個人情報を含むため URL は共有しないでください。
 * 一覧と同じ検索・教室絞り込みクエリを反映します（q, classroom）。
 * 取り込み用 CSV と同じ列構成で出力します。
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (user.accountRole !== "staff" || !user.isAdmin) {
    return NextResponse.json(
      { error: "エクスポートは管理者のみ利用できます。" },
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
      "id, name, name_kana, grade, classroom, subjects, portal_id, birthday, enrollment_robot_capacity_id, enrollment_prog_capacity_id, next_text_robot_course, next_text_robot_text, next_text_programming_course, next_text_programming_text, course_start_robot_ym, course_start_programming_ym, promotion_scheduled_ym, scratch_login_id, scratch_login_pass, minecraft_login, leave_from_ym, leave_until_ym, withdrawal_until_ym, persistent_memo, note"
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

  const { data: students, error } = await query.returns<ExportStudent[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: capacities, error: capError } = await supabase
    .from("lesson_capacities")
    .select("id, classroom, day_of_week, week_ordinals, period, subject");

  if (capError) {
    return NextResponse.json({ error: capError.message }, { status: 500 });
  }

  const capacityById = new Map(
    (capacities ?? []).map((c) => [c.id, c as LessonCapacity])
  );

  const lines: string[] = [STUDENT_CSV_HEADER];

  for (const s of students ?? []) {
    const [robotWeek, robotDay, robotPeriod] = slotCells(
      s.enrollment_robot_capacity_id,
      capacityById
    );
    const [progWeek, progDay, progPeriod] = slotCells(
      s.enrollment_prog_capacity_id,
      capacityById
    );

    lines.push(
      toCsvRow([
        s.id,
        s.name,
        s.name_kana ?? "",
        s.grade,
        s.classroom ?? "",
        (s.subjects ?? []).join("; "),
        s.portal_id ?? "",
        s.birthday ?? "",
        robotWeek,
        robotDay,
        robotPeriod,
        s.next_text_robot_course ?? "",
        s.next_text_robot_text ?? "",
        progWeek,
        progDay,
        progPeriod,
        s.next_text_programming_course ?? "",
        s.next_text_programming_text ?? "",
        s.course_start_robot_ym ?? "",
        s.course_start_programming_ym ?? "",
        s.promotion_scheduled_ym ?? "",
        s.scratch_login_id ?? "",
        s.scratch_login_pass ?? "",
        s.minecraft_login ?? "",
        s.leave_from_ym ?? "",
        s.leave_until_ym ?? "",
        s.withdrawal_until_ym ?? "",
        s.persistent_memo ?? "",
        s.note ?? "",
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
