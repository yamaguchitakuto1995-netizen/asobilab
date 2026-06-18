"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Field, inputClass } from "@/components/Field";
import {
  ProgLessonPickers,
  RobotLessonPickers,
} from "@/components/LessonTextbookCurriculumPickers";
import { confirmLessonFromDailyBoard } from "@/app/(dashboard)/daily/actions";
import {
  DAILY_CONFIRM_ATTENDANCE_OPTIONS,
  lessonTodayTextLabel,
} from "@/lib/todayLessonDisplay";
import type { AttendanceStatus } from "@/lib/types";
import type { DailyLessonItem } from "./DailyLessonCarousel";

type Props = {
  open: boolean;
  onClose: () => void;
  lesson: DailyLessonItem;
  date: string;
  defaultTodayText: string;
};

export function AttendanceConfirmDialog({
  open,
  onClose,
  lesson,
  date,
  defaultTodayText,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [attendance, setAttendance] = useState<AttendanceStatus>(
    lesson.status === "scheduled" && lesson.attendance === "makeup"
      ? "makeup"
      : lesson.status === "recorded"
        ? lesson.attendance
        : "present"
  );
  const [textbook, setTextbook] = useState(
    lesson.textbook?.trim() ||
      lessonTodayTextLabel(lesson, lesson.students) ||
      ""
  );
  const [textMemo, setTextMemo] = useState(lesson.text_memo?.trim() ?? "");

  if (!open) return null;

  function submit() {
    const fd = new FormData();
    fd.set("lesson_id", lesson.id);
    fd.set("return_date", date);
    fd.set("attendance", attendance);
    fd.set("textbook", textbook);
    fd.set("text_memo", textMemo);
    startTransition(async () => {
      await confirmLessonFromDailyBoard(fd);
      router.refresh();
      onClose();
    });
  }

  const studentName = lesson.students?.name ?? "生徒";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={() => !pending && onClose()}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-900">出席確認</h2>
          <p className="text-sm text-slate-600 mt-1">
            {studentName} さん · {lesson.subject ?? "科目未設定"}
          </p>
        </div>

        <Field label="出欠" htmlFor="daily_confirm_attendance" required>
          <div className="grid grid-cols-2 gap-2">
            {DAILY_CONFIRM_ATTENDANCE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
              >
                <input
                  type="radio"
                  name="daily_confirm_attendance"
                  value={opt.value}
                  checked={attendance === opt.value}
                  onChange={() => setAttendance(opt.value)}
                  className="accent-brand-600"
                />
                <span className="text-sm font-medium">{opt.label}</span>
              </label>
            ))}
          </div>
        </Field>

        {lesson.subject === "ロボット" ? (
          <RobotLessonPickers initialTextbook={textbook} onPick={setTextbook} />
        ) : lesson.subject === "プログラミング" ? (
          <ProgLessonPickers initialTextbook={textbook} onPick={setTextbook} />
        ) : null}

        <Field label="本日のテキスト" htmlFor="daily_confirm_textbook" required>
          <input
            id="daily_confirm_textbook"
            type="text"
            maxLength={120}
            value={textbook}
            onChange={(e) => setTextbook(e.target.value)}
            className={inputClass}
            placeholder="使用した教材・章"
          />
        </Field>

        <Field label="備考（本日の進捗など）" htmlFor="daily_confirm_memo">
          <textarea
            id="daily_confirm_memo"
            rows={4}
            maxLength={2000}
            value={textMemo}
            onChange={(e) => setTextMemo(e.target.value)}
            className={inputClass}
            placeholder="どこまで進んだか、次回への申し送りなど"
          />
        </Field>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={pending || !textbook.trim()}
            onClick={submit}
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
          >
            {pending ? "保存中…" : "確定する"}
          </button>
        </div>
      </div>
    </div>
  );
}
