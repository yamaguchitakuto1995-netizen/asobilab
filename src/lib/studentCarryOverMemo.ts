import { formatWithdrawalUntilLabel } from "@/lib/studentWithdrawal";

export type StudentCarryOverMemoFields = {
  persistent_memo?: string | null;
  /** 旧メモ欄（persistent_memo 未設定時の表示フォールバック） */
  note?: string | null;
  withdrawal_until_ym?: string | null;
};

/** コマ表に表示する継続備考（退会予定 + 手入力の継続備考） */
export function formatCarryOverMemoDisplay(
  student: StudentCarryOverMemoFields
): string | null {
  const lines: string[] = [];
  const withdrawal = formatWithdrawalUntilLabel(student.withdrawal_until_ym);
  if (withdrawal) lines.push(withdrawal);
  const manual =
    student.persistent_memo?.trim() || student.note?.trim();
  if (manual) lines.push(manual);
  return lines.length > 0 ? lines.join("\n") : null;
}
