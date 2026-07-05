"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending, onClose]);

  if (!open || !mounted) return null;

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

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col sm:items-center sm:justify-center sm:p-4 sm:bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="daily_confirm_title"
    >
      {/* モバイル: 画面全体 / デスクトップ: 背景クリックで閉じる */}
      <button
        type="button"
        aria-label="閉じる"
        className="hidden sm:block absolute inset-0 cursor-default"
        tabIndex={-1}
        onClick={() => !pending && onClose()}
      />

      <div
        className="
          relative flex flex-col w-full h-dvh max-h-dvh bg-white
          sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl sm:shadow-xl
          pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
        "
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2
              id="daily_confirm_title"
              className="text-lg font-semibold text-slate-900"
            >
              {lesson.status === "scheduled" ? "出席確認" : "内容を更新"}
            </h2>
            <p className="text-sm text-slate-600 mt-0.5 truncate">
              {studentName} さん · {lesson.subject ?? "科目未設定"}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="キャンセル"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-3">
          <Field label="出欠" htmlFor="daily_confirm_attendance" required>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {DAILY_CONFIRM_ATTENDANCE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 sm:px-3 sm:py-2 cursor-pointer hover:bg-slate-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50"
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
              rows={3}
              maxLength={2000}
              value={textMemo}
              onChange={(e) => setTextMemo(e.target.value)}
              className={inputClass}
              placeholder="どこまで進んだか、次回への申し送りなど"
            />
          </Field>
        </div>

        <footer className="shrink-0 border-t border-slate-200 px-4 py-3 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end bg-white">
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
        </footer>
      </div>
    </div>,
    document.body
  );
}
