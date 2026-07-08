import { formatDateLong } from "@/lib/date";
import { sendLineMulticast } from "@/lib/lineMessaging";
import { ATTENDANCE_LABEL, periodLabel } from "@/lib/types";
import type { AttendanceStatus } from "@/lib/types";

export type LineRegistrationSource =
  | "保護者フォーム"
  | "職員登録"
  | "管理者登録";

type LessonSlot = {
  lessonDate: string;
  period: number;
  subject: string;
};

function formatSlot(slot: LessonSlot): string {
  return `${formatDateLong(slot.lessonDate)} ${periodLabel(slot.period)} · ${slot.subject}`;
}

function runLineNotification(text: string): void {
  void sendLineMulticast(text).catch((error) => {
    console.error("[LINE notify]", error);
  });
}

export function formatAbsenceRegisteredLineMessage(input: {
  studentName: string;
  slot: LessonSlot;
  source: LineRegistrationSource;
}): string {
  return [
    "【欠席登録】",
    input.studentName,
    formatSlot(input.slot),
    `登録: ${input.source}`,
  ].join("\n");
}

export function formatMakeupRegisteredLineMessage(input: {
  studentName: string;
  sourceSlot: LessonSlot;
  targetSlot: LessonSlot;
  source: LineRegistrationSource;
}): string {
  return [
    "【振替登録】",
    input.studentName,
    `欠席: ${formatSlot(input.sourceSlot)}`,
    `振替: ${formatSlot(input.targetSlot)}`,
    `登録: ${input.source}`,
  ].join("\n");
}

export function formatAttendanceWithMemoLineMessage(input: {
  studentName: string;
  lessonDate: string;
  period: number;
  subject: string;
  attendance: AttendanceStatus;
  textMemo: string;
  persistentMemo?: string;
}): string {
  const lines = [
    "【備考あり出席登録】",
    input.studentName,
    `${formatDateLong(input.lessonDate)} ${periodLabel(input.period)} · ${input.subject}`,
    `出欠: ${ATTENDANCE_LABEL[input.attendance]}`,
    `備考: ${input.textMemo.trim()}`,
  ];

  const persistentMemo = input.persistentMemo?.trim();
  if (persistentMemo) {
    lines.push(`継続備考: ${persistentMemo}`);
  }

  return lines.join("\n");
}

export function notifyLineAbsenceRegistered(input: {
  studentName: string;
  slot: LessonSlot;
  source: LineRegistrationSource;
}): void {
  runLineNotification(formatAbsenceRegisteredLineMessage(input));
}

export function notifyLineMakeupRegistered(input: {
  studentName: string;
  sourceSlot: LessonSlot;
  targetSlot: LessonSlot;
  source: LineRegistrationSource;
}): void {
  runLineNotification(formatMakeupRegisteredLineMessage(input));
}

export function notifyLineAttendanceWithMemoRegistered(input: {
  studentName: string;
  lessonDate: string;
  period: number;
  subject: string;
  attendance: AttendanceStatus;
  textMemo: string;
  persistentMemo?: string;
}): void {
  if (!input.textMemo.trim()) return;
  runLineNotification(formatAttendanceWithMemoLineMessage(input));
}
