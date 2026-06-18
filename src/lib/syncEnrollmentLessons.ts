import type { SupabaseClient } from "@supabase/supabase-js";
import {
  syncStudentRegularAttendance,
  type SyncStudentRegularAttendanceParams,
} from "@/lib/regularAttendanceSync";

export type SyncEnrollmentLessonsParams = SyncStudentRegularAttendanceParams;

/**
 * 生徒のレギュラー出席コマ設定に合わせ、登録済みコマ時刻から出席予定を同期する。
 * 手動で追加した scheduled は、日付・コマ・教科が重なる場合のみスキップする。
 */
export async function syncEnrollmentLessons(
  supabase: SupabaseClient,
  p: SyncEnrollmentLessonsParams
): Promise<{ error: string | null }> {
  const result = await syncStudentRegularAttendance(supabase, p);
  return { error: result.error };
}
