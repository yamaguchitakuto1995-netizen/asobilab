"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { findAuthUserIdByEmail, createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function editPath(studentId: string, query?: Record<string, string>) {
  const q = query ? new URLSearchParams(query).toString() : "";
  return `/students/${studentId}/edit${q ? `?${q}` : ""}`;
}

export async function linkParentToStudent(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "").trim();
  const parentEmail = String(formData.get("parentEmail") ?? "").trim();
  const base = editPath(studentId);

  const staff = await getCurrentUser();
  if (!staff || staff.accountRole !== "staff") {
    redirect("/login");
  }
  if (!studentId) redirect("/students");
  if (!parentEmail) {
    redirect(
      editPath(studentId, {
        parentError: "保護者のメールアドレスを入力してください。",
      })
    );
  }

  let parentUserId: string;
  try {
    const found = await findAuthUserIdByEmail(parentEmail);
    if (!found) {
      redirect(
        editPath(studentId, {
          parentError:
            "そのメールアドレスのユーザーが見つかりません。招待・登録後に再度お試しください。",
        })
      );
    }
    parentUserId = found;
  } catch {
    redirect(
      editPath(studentId, {
        parentError:
          "ユーザー検索に失敗しました。SUPABASE_SERVICE_ROLE_KEY がサーバーに設定されているか確認してください。",
      })
    );
  }

  if (parentUserId === staff.id) {
    redirect(
      editPath(studentId, {
        parentError: "自分自身を保護者として紐付けできません。",
      })
    );
  }

  const supabase = await createClient();

  const { data: parentProfile } = await supabase
    .from("teacher_profiles")
    .select("is_admin")
    .eq("id", parentUserId)
    .maybeSingle<{ is_admin: boolean }>();

  if (parentProfile?.is_admin) {
    redirect(
      editPath(studentId, {
        parentError: "管理者アカウントは保護者紐付けの対象にできません。",
      })
    );
  }

  try {
    const admin = createAdminClient();
    const { error: roleErr } = await admin
      .from("teacher_profiles")
      .update({ account_role: "parent" })
      .eq("id", parentUserId)
      .eq("is_admin", false);

    if (roleErr) {
      redirect(
        editPath(studentId, { parentError: roleErr.message })
      );
    }
  } catch {
    redirect(
      editPath(studentId, {
        parentError:
          "保護者フラグの更新に失敗しました。サービスロール設定を確認してください。",
      })
    );
  }

  const { error: insertErr } = await supabase.from("parent_student_links").insert({
    parent_user_id: parentUserId,
    student_id: studentId,
    created_by: staff.id,
  });

  if (insertErr) {
    const msg =
      insertErr.code === "23505"
        ? "すでにこの保護者は紐付け済みです。"
        : insertErr.message;
    redirect(editPath(studentId, { parentError: msg }));
  }

  revalidatePath(`/students/${studentId}/edit`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/parent");
  redirect(editPath(studentId, { parentMsg: "保護者を紐付けました。" }));
}

export async function unlinkParentFromStudent(formData: FormData) {
  const studentId = String(formData.get("studentId") ?? "").trim();
  const parentUserId = String(formData.get("parentUserId") ?? "").trim();

  const staff = await getCurrentUser();
  if (!staff || staff.accountRole !== "staff") {
    redirect("/login");
  }
  if (!studentId || !parentUserId) {
    redirect(studentId ? editPath(studentId) : "/students");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("parent_student_links")
    .delete()
    .eq("student_id", studentId)
    .eq("parent_user_id", parentUserId);

  if (error) {
    redirect(
      editPath(studentId, { parentError: error.message })
    );
  }

  revalidatePath(`/students/${studentId}/edit`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/parent");
  redirect(editPath(studentId, { parentMsg: "紐付けを解除しました。" }));
}
