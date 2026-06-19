"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { inputClass } from "@/components/Field";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import { formatDateLong, isValidDate, shiftDate, todayIso } from "@/lib/date";
import { dayColor, dayLabel, dowOf } from "@/lib/days";
import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import {
  MAKEUP_TARGET_MAX_DAYS_AHEAD,
  SCHEDULED_ATTENDANCE_LABEL,
  periodLabel,
  type ClassroomPeriodTime,
  type CourseSubject,
  type SlotAvailability,
} from "@/lib/types";
import {
  bookMakeupLesson,
  bookMakeupLessonsBatch,
  listScheduledLessonsForMakeup,
  type FoundStudent,
  type ScheduledLessonOption,
} from "./actions";

type Props = {
  students: FoundStudent[];
  periodTimes?: ClassroomPeriodTime[];
  daysAhead?: number;
  pollIntervalMs?: number;
  onBack: () => void;
  onReset: () => void;
};

type SourceSelection = {
  lessonDate: string;
  period: number;
  subject: string;
};

type BookedSummary = {
  student: FoundStudent;
  lessonId: string;
  source: SourceSelection;
  dest: SlotAvailability;
};

type Cache = Record<string, SlotAvailability[]>;

export function AvailabilityPicker({
  students,
  periodTimes = [],
  daysAhead = MAKEUP_TARGET_MAX_DAYS_AHEAD,
  pollIntervalMs = 30_000,
  onBack,
  onReset,
}: Props) {
  const isMulti = students.length > 1;
  const today = todayIso();
  const maxDate = useMemo(() => shiftDate(today, daysAhead), [today, daysAhead]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [cache, setCache] = useState<Cache>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [sources, setSources] = useState<Record<string, SourceSelection | null>>(
    {}
  );
  const [suggestionsByStudent, setSuggestionsByStudent] = useState<
    Record<string, ScheduledLessonOption[] | null>
  >({});
  const [suggestErrors, setSuggestErrors] = useState<Record<string, string>>({});

  const [destByStudent, setDestByStudent] = useState<
    Record<string, SlotAvailability | null>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<BookedSummary[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const subjectsByStudent = useMemo(
    () =>
      Object.fromEntries(
        students.map((s) => [s.id, new Set<string>(s.subjects ?? [])])
      ),
    [students]
  );

  const allSourcesSelected = students.every((s) => sources[s.id]);
  const allDestSelected = students.every((s) => destByStudent[s.id]);

  function timeSuffix(
    date: string,
    period: number,
    subject: string,
    classroom: string
  ): string {
    if (!periodTimes.length) return "";
    const row = resolveClassroomPeriodTime(periodTimes, {
      classroom,
      lessonDate: date,
      period,
      subject,
    });
    return row ? ` · ${formatTimeRange(row.start_time, row.end_time)}` : "";
  }

  useEffect(() => {
    let cancelled = false;
    setSuggestErrors({});
    setSuggestionsByStudent(
      Object.fromEntries(students.map((s) => [s.id, null]))
    );
    (async () => {
      try {
        const nextSuggestions: Record<string, ScheduledLessonOption[] | null> =
          {};
        const nextErrors: Record<string, string> = {};
        await Promise.all(
          students.map(async (s) => {
            try {
              const r = await listScheduledLessonsForMakeup({
                studentId: s.id,
                name: s.name,
                classroom: s.classroom,
                grade: s.grade,
              });
              if (cancelled) return;
              if (r.ok) nextSuggestions[s.id] = r.lessons;
              else {
                nextSuggestions[s.id] = [];
                nextErrors[s.id] = r.error;
              }
            } catch (e) {
              if (cancelled) return;
              nextSuggestions[s.id] = [];
              nextErrors[s.id] =
                e instanceof Error
                  ? e.message
                  : "予定の取得に失敗しました。";
            }
          })
        );
        if (!cancelled) {
          setSuggestionsByStudent(nextSuggestions);
          setSuggestErrors(nextErrors);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "予定の取得に失敗しました。"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [students]);

  const dates = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i <= daysAhead; i++) arr.push(shiftDate(today, i));
    return arr;
  }, [today, daysAhead]);

  const fetchAvailability = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/availability?date=${encodeURIComponent(date)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `空き状況の取得に失敗 (${res.status})`);
      }
      const body = (await res.json()) as {
        date: string;
        slots: SlotAvailability[];
      };
      setCache((prev) => ({ ...prev, [body.date]: body.slots }));
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailability(selectedDate);
  }, [selectedDate, fetchAvailability]);

  useEffect(() => {
    const id = setInterval(() => fetchAvailability(selectedDate), pollIntervalMs);
    return () => clearInterval(id);
  }, [selectedDate, fetchAvailability, pollIntervalMs]);

  const channelRef = useRef<ReturnType<
    ReturnType<typeof createBrowserClient>["channel"]
  > | null>(null);
  useEffect(() => {
    try {
      const supabase = createBrowserClient();
      const channel = supabase
        .channel(`apply-availability-${students.map((s) => s.id).join("-")}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "lessons" },
          (payload) => {
            const dates = new Set<string>();
            for (const row of [payload.new, payload.old]) {
              const d = (row as { lesson_date?: string } | null)?.lesson_date;
              if (d) dates.add(String(d).slice(0, 10));
            }
            if (dates.has(selectedDate)) fetchAvailability(selectedDate);
          }
        )
        .subscribe();
      channelRef.current = channel;
      return () => {
        supabase.removeChannel(channel);
      };
    } catch (e) {
      console.error("[AvailabilityPicker] realtime:", e);
      return undefined;
    }
  }, [selectedDate, students, fetchAvailability]);

  useEffect(() => {
    if (!confirmOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen]);

  const slots = cache[selectedDate] ?? null;

  function pickSource(studentId: string, row: ScheduledLessonOption) {
    setSources((prev) => ({
      ...prev,
      [studentId]: {
        lessonDate: row.lesson_date,
        period: row.period,
        subject: row.subject,
      },
    }));
    setDestByStudent((prev) => ({ ...prev, [studentId]: null }));
    setSubmitError(null);
  }

  function pickDest(studentId: string, slot: SlotAvailability) {
    if (submitting || confirmOpen) return;
    if (!sources[studentId]) {
      setSubmitError("先に「欠席する授業」を選んでください。");
      return;
    }
    setDestByStudent((prev) => ({ ...prev, [studentId]: slot }));
    setSubmitError(null);
    if (isMulti && allSourcesSelected) {
      const next = { ...destByStudent, [studentId]: slot };
      if (students.every((s) => next[s.id])) setConfirmOpen(true);
    } else if (!isMulti) {
      setConfirmOpen(true);
    }
  }

  async function submitBatch() {
    if (submitting || !allSourcesSelected || !allDestSelected) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const bookings = students.map((s) => {
        const source = sources[s.id]!;
        const dest = destByStudent[s.id]!;
        return {
          studentId: s.id,
          lessonDate: selectedDate,
          period: dest.period,
          subject: dest.subject,
          sourceLessonDate: source.lessonDate,
          sourcePeriod: source.period,
          sourceSubject: source.subject,
          lessonClassroom: dest.classroom,
        };
      });

      const result =
        bookings.length === 1
          ? await (async () => {
              const b = bookings[0]!;
              const r = await bookMakeupLesson(b);
              return r.ok
                ? { ok: true as const, lessonIds: [r.lessonId] }
                : r;
            })()
          : await bookMakeupLessonsBatch(bookings);

      if (!result.ok) {
        setSubmitError(result.error);
        fetchAvailability(selectedDate);
        return;
      }

      const summaries = students.flatMap((s, i) => {
        const lessonId = result.lessonIds[i];
        if (!lessonId) return [];
        return [
          {
            student: s,
            lessonId,
            source: sources[s.id]!,
            dest: destByStudent[s.id]!,
          },
        ];
      });

      if (summaries.length === 0) {
        setSubmitError("登録結果の取得に失敗しました。教室までお問い合わせください。");
        fetchAvailability(selectedDate);
        return;
      }

      setBooked(summaries);
    } catch (e) {
      setSubmitError(
        e instanceof Error
          ? e.message
          : "登録中にエラーが発生しました。しばらくしてから再度お試しください。"
      );
      fetchAvailability(selectedDate);
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  if (booked) {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl p-6 space-y-4">
        <div className="text-center">
          <div className="text-emerald-700 text-3xl">✓</div>
          <h2 className="text-lg font-semibold mt-2">振替の登録が完了しました</h2>
        </div>
        <ul className="space-y-3 text-sm text-slate-700">
          {booked.map((b) => (
            <li
              key={b.lessonId}
              className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5"
            >
              <p className="font-semibold text-slate-900">{b.student.name} さん</p>
              <p className="mt-1">
                欠席: {formatDateLong(b.source.lessonDate)}{" "}
                {periodLabel(b.source.period)}
                {timeSuffix(
                  b.source.lessonDate,
                  b.source.period,
                  b.source.subject,
                  b.student.classroom
                )}{" "}
                {b.source.subject}
              </p>
              <p>
                振替先: {formatDateLong(selectedDate)}{" "}
                {periodLabel(b.dest.period)}
                {timeSuffix(
                  selectedDate,
                  b.dest.period,
                  b.dest.subject,
                  b.dest.classroom
                )}{" "}
                {b.dest.subject}（{b.dest.classroom}）
              </p>
              <p className="text-xs text-slate-400 mt-1">
                控え: {b.lessonId.slice(0, 8)}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={() => {
              setBooked(null);
              setSources({});
              setDestByStudent({});
              setSubmitError(null);
              fetchAvailability(selectedDate);
            }}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
          >
            別の日も申請する
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2"
          >
            最初の画面に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-brand-200 rounded-2xl p-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-500">申請する生徒</p>
          <p className="font-semibold">
            {students.map((s) => s.name).join("、")}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {isMulti
              ? `${students.length}名分を1回で申請します`
              : `${students[0]!.grade} / ${students[0]!.classroom}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-brand-600 hover:underline shrink-0"
        >
          戻る
        </button>
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-1">
          1. 欠席する授業（振替の元）を選ぶ
        </p>
        <p className="text-xs text-slate-500 mb-3">
          {isMulti
            ? "お子様ごとに、欠席にしたい授業（出席予定・振替予定）を選んでください。別教室のコマも選べます。"
            : "出席予定・振替予定のコマから欠席にする授業を選んでください。所属教室以外のコマも表示されます。"}
        </p>

        <div className="space-y-5">
          {students.map((s) => {
            const suggestions = suggestionsByStudent[s.id] ?? null;
            const source = sources[s.id];
            const suggestError = suggestErrors[s.id];
            return (
              <div key={s.id} className="space-y-2">
                {isMulti ? (
                  <p className="text-sm font-medium text-slate-800">{s.name} さん</p>
                ) : null}
                {suggestError ? (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    {suggestError}
                  </p>
                ) : null}
                {suggestions === null ? (
                  <div className="h-16 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />
                ) : suggestions.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {suggestions.map((row) => {
                      const dow = dowOf(row.lesson_date);
                      const venue =
                        row.lesson_classroom?.trim() || s.classroom;
                      const attendanceLabel =
                        row.attendance === "makeup"
                          ? SCHEDULED_ATTENDANCE_LABEL.makeup
                          : SCHEDULED_ATTENDANCE_LABEL.present;
                      const picked =
                        source?.lessonDate === row.lesson_date &&
                        source?.period === row.period &&
                        source?.subject === row.subject;
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => pickSource(s.id, row)}
                          className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition ${
                            picked
                              ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                              : "border-slate-200 hover:border-brand-400 hover:shadow"
                          }`}
                        >
                          <div className={`text-[11px] font-semibold ${dayColor(dow)}`}>
                            {dayLabel(dow, "long")}
                          </div>
                          <div className="text-base font-bold text-slate-900 mt-0.5">
                            {formatDateLong(row.lesson_date)}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">
                              {periodLabel(row.period)}
                              {timeSuffix(
                                row.lesson_date,
                                row.period,
                                row.subject,
                                venue
                              )}
                            </span>
                            <ClassroomBadge classroom={venue} />
                            <span className="text-xs font-medium rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 ring-1 ring-slate-200/80">
                              {row.subject}
                            </span>
                            <span className="text-[10px] font-medium text-slate-500">
                              {attendanceLabel}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    振替の元にできる予定がありません。
                  </div>
                )}
                {source ? (
                  <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    選択中: {formatDateLong(source.lessonDate)}{" "}
                    {periodLabel(source.period)} {source.subject}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={!allSourcesSelected ? "opacity-50 pointer-events-none select-none" : ""}
        aria-hidden={!allSourcesSelected}
      >
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2">
            2. 振替先の日付を選ぶ
          </p>
          <label className="block mb-3">
            <span className="sr-only">振替先の日付</span>
            <input
              type="date"
              min={today}
              max={maxDate}
              value={selectedDate}
              onChange={(e) => {
                const v = e.target.value;
                if (isValidDate(v)) {
                  setSelectedDate(v);
                  setDestByStudent({});
                }
              }}
              className={inputClass}
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
            {dates.map((d) => {
              const dow = new Date(d).getDay();
              const isSelected = d === selectedDate;
              const day = new Date(`${d}T00:00:00`).getDate();
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setSelectedDate(d);
                    setDestByStudent({});
                  }}
                  className={`snap-start shrink-0 w-16 rounded-xl border px-1 py-2 text-center ${
                    isSelected
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className={`text-[10px] ${dayColor(dow)}`}>{dayLabel(dow)}</div>
                  <div className="text-xl font-bold">{day}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">
              3. 空いているコマを選ぶ
            </p>
            <p className="text-[10px] text-slate-400">
              {loading ? "更新中…" : lastUpdated ? `${lastUpdated.toLocaleTimeString("ja-JP")} 更新` : ""}
            </p>
          </div>

          {error ? (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">
              {error}
            </p>
          ) : null}
          {submitError ? (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">
              {submitError}
            </p>
          ) : null}

          {slots === null ? (
            <SkeletonGrid />
          ) : (
            <div className="space-y-6">
              {students.map((s) => {
                const studentSubjects = subjectsByStudent[s.id] ?? new Set();
                const pickedDest = destByStudent[s.id];
                return (
                  <div key={`dest-${s.id}`} className="space-y-2">
                    {isMulti ? (
                      <p className="text-sm font-medium text-slate-800">
                        {s.name} さんの振替先
                        {pickedDest
                          ? ` — ${pickedDest.period}コマ目 ${pickedDest.subject}`
                          : ""}
                      </p>
                    ) : null}
                    {slots.length === 0 ? (
                      <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-4 text-center text-sm text-slate-500">
                        この日に空きのある振替枠はありません。
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {slots.map((slot) => {
                          const isFull = slot.available <= 0;
                          const isStudentSubject = studentSubjects.has(slot.subject);
                          const isPicked =
                            pickedDest?.classroom === slot.classroom &&
                            pickedDest?.period === slot.period &&
                            pickedDest?.subject === slot.subject;
                          const disabled =
                            isFull || submitting || !isStudentSubject || confirmOpen;
                          return (
                            <li key={`${s.id}-${slot.classroom}-${slot.period}-${slot.subject}`}>
                              <button
                                type="button"
                                onClick={() => pickDest(s.id, slot)}
                                disabled={disabled}
                                className={`w-full text-left rounded-xl border p-4 flex items-center justify-between gap-3 transition ${
                                  isPicked
                                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                                    : disabled
                                      ? "border-slate-200 bg-slate-50 cursor-not-allowed opacity-60"
                                      : "border-brand-200 bg-white hover:border-brand-500 hover:bg-brand-50"
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base font-semibold">
                                      {slot.period}コマ目
                                      {timeSuffix(
                                        selectedDate,
                                        slot.period,
                                        slot.subject,
                                        slot.classroom
                                      )}
                                    </span>
                                    <ClassroomBadge classroom={slot.classroom} />
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                      {slot.subject}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`shrink-0 text-sm font-bold rounded-lg px-3 py-1.5 ${
                                    isFull
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-emerald-100 text-emerald-700"
                                  }`}
                                >
                                  {isFull ? "満員" : `空き${slot.available}`}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {isMulti && allSourcesSelected && allDestSelected ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="mt-4 w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5"
            >
              内容を確認して登録する
            </button>
          ) : null}
        </div>
      </div>

      {confirmOpen && allSourcesSelected && allDestSelected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => !submitting && setConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-900">
              この内容で振替を登録しても良いですか？
            </h2>
            <ul className="text-sm text-slate-700 space-y-3">
              {students.map((s) => {
                const source = sources[s.id]!;
                const dest = destByStudent[s.id]!;
                return (
                  <li
                    key={s.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
                  >
                    <p className="font-semibold">{s.name} さん</p>
                    <p className="text-xs">
                      欠席: {formatDateLong(source.lessonDate)}{" "}
                      {periodLabel(source.period)} {source.subject}
                    </p>
                    <p className="text-xs">
                      振替先: {formatDateLong(selectedDate)}{" "}
                      {periodLabel(dest.period)} {dest.subject}（{dest.classroom}）
                    </p>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
                className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitBatch()}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
              >
                {submitting ? "登録中…" : "登録する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-[68px] rounded-xl border border-slate-200 bg-slate-50 animate-pulse"
        />
      ))}
    </ul>
  );
}

export function asCourseSubject(s: string): CourseSubject | null {
  return s === "プログラミング" || s === "ロボット" ? s : null;
}
