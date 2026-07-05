import type { CourseSubject } from "@/lib/types";

export type ProgrammingLoginFields = {
  scratch_login_id?: string | null;
  scratch_login_pass?: string | null;
  minecraft_login?: string | null;
};

export function readProgrammingLoginFromForm(
  formData: FormData,
  subjects: CourseSubject[]
): { value: ProgrammingLoginFields; error?: string } {
  const scratchId = String(formData.get("scratch_login_id") ?? "").trim();
  const scratchPass = String(formData.get("scratch_login_pass") ?? "").trim();
  const minecraftLogin = String(formData.get("minecraft_login") ?? "").trim();

  if (!subjects.includes("プログラミング")) {
    return {
      value: {
        scratch_login_id: null,
        scratch_login_pass: null,
        minecraft_login: null,
      },
    };
  }

  if (!scratchId) {
    return {
      value: {
        scratch_login_id: null,
        scratch_login_pass: null,
        minecraft_login: null,
      },
      error: "プログラミング受講の場合、スクラッチログインIDを入力してください。",
    };
  }

  if (!scratchPass) {
    return {
      value: {
        scratch_login_id: null,
        scratch_login_pass: null,
        minecraft_login: null,
      },
      error: "プログラミング受講の場合、スクラッチログインPASSを入力してください。",
    };
  }

  return {
    value: {
      scratch_login_id: scratchId,
      scratch_login_pass: scratchPass,
      minecraft_login: minecraftLogin || null,
    },
  };
}

export function hasProgrammingLoginDisplay(
  student: ProgrammingLoginFields
): boolean {
  return Boolean(student.scratch_login_id?.trim());
}
