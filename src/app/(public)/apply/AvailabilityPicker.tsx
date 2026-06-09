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
  COURSE_SUBJECTS,
  MAKEUP_TARGET_MAX_DAYS_AHEAD,
  periodLabel,
  type ClassroomPeriodTime,
  type CourseSubject,
  type SlotAvailability,
} from "@/lib/types";
import {
  bookMakeupLesson,
  listScheduledLessonsForMakeup,
  type FoundStudent,
  type ScheduledLessonOption,
} from "./actions";

type Props = {
  student: FoundStudent;
  /** 教室・コマの時刻（振替フォーム表示用） */
  periodTimes?: ClassroomPeriodTime[];
  /** 振替先を選べる日数（今日から +N 日まで）。省略時は {@link MAKEUP_TARGET_MAX_DAYS_AHEAD} */
  daysAhead?: number;
  /** ポーリング間隔 (ms) */
  pollIntervalMs?: number;
  /** 戻るリンクの操作 (生徒情報をクリアして再入力) */
  onBack: () => void;
};

type SourceSelection = {
  lessonDate: string;
  period: number;
  subject: string;
};

type Cache = Record<string, SlotAvailability[]>;

export function AvailabilityPicker({
  student,
  periodTimes = [],
  daysAhead = MAKEUP_TARGET_MAX_DAYS_AHEAD,
  pollIntervalMs = 30_000,
  onBack,
}: Props) {
  const today = todayIso();
  const maxDate = useMemo(() => shiftDate(today, daysAhead), [today, daysAhead]);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [cache, setCache] = useState<Cache>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [source, setSource] = useState<SourceSelection | null>(null);
  const [suggestions, setSuggestions] = useState<ScheduledLessonOption[] | null>(
    null
  );
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [bookedLessonId, setBookedLessonId] = useState<string | null>(null);
  const [bookedDest, setBookedDest] = useState<{
    period: number;
    subject: string;
    classroom: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmSlot, setConfirmSlot] = useState<SlotAvailability | null>(null);

  // 生徒の所属教室・受講教科のみを表示候補にする
  const studentSubjects = useMemo(
    () => new Set<string>(student.subjects ?? []),
    [student]
  );

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
    setSuggestError(null);
    (async () => {
      const r = await listScheduledLessonsForMakeup({
        studentId: student.id,
        name: student.name,
        classroom: student.classroom,
        grade: student.grade,
      });
      if (cancelled) return;
      if (r.ok) setSuggestions(r.lessons);
      else {
        setSuggestions([]);
        setSuggestError(r.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student]);

  const dates = useMemo(() => {
    const arr: string[] = [];
    for (let i = 0; i <= daysAhead; i++) arr.push(shiftDate(today, i));
    return arr;
  }, [today, daysAhead]);

  const fetchAvailability = useCallback(
    async (date: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/availability?date=${encodeURIComponent(date)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
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
    },
    []
  );

  // 日付を切り替えたら即フェッチ
  useEffect(() => {
    fetchAvailability(selectedDate);
  }, [selectedDate, fetchAvailability]);

  // ポーリング (フォールバック)
  useEffect(() => {
    const id = setInterval(() => {
      fetchAvailability(selectedDate);
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [selectedDate, fetchAvailability, pollIntervalMs]);

  // Supabase Realtime: lessons の INSERT/UPDATE/DELETE を購読 → 該当日付なら refetch
  const channelRef = useRef<ReturnType<
    ReturnType<typeof createBrowserClient>["channel"]
  > | null>(null);
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`apply-availability-${student.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lessons" },
        (payload) => {
          // payload.new / payload.old から lesson_date を抜き出して該当日のみ更新
          const dates = new Set<string>();
          for (const row of [payload.new, payload.old]) {
            const d = (row as { lesson_date?: string } | null)?.lesson_date;
            if (d) dates.add(d);
          }
          if (dates.has(selectedDate)) fetchAvailability(selectedDate);
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDate, student.id, fetchAvailability]);

  useEffect(() => {
    if (!confirmSlot) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setConfirmSlot(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmSlot]);

  const slots = cache[selectedDate] ?? null;

  function openMakeupConfirm(slot: SlotAvailability) {
    if (submitting || confirmSlot) return;
    if (!source) {
      setSubmitError("先に「欠席する授業」を選んでください。");
      return;
    }
    setSubmitError(null);
    setConfirmSlot(slot);
  }

  async function submitMakeupFromModal() {
    if (submitting || !source || !confirmSlot) return;
    const slot = confirmSlot;
    setSubmitting(true);
    setSubmitError(null);
    const result = await bookMakeupLesson({
      studentId: student.id,
      lessonDate: selectedDate,
      period: slot.period,
      subject: slot.subject,
      sourceLessonDate: source.lessonDate,
      sourcePeriod: source.period,
      sourceSubject: source.subject,
      lessonClassroom: slot.classroom,
    });
    setSubmitting(false);
    setConfirmSlot(null);
    if (!result.ok) {
      setSubmitError(result.error);
      fetchAvailability(selectedDate);
      return;
    }
    setBookedDest({
      period: slot.period,
      subject: slot.subject,
      classroom: slot.classroom,
    });
    setBookedLessonId(result.lessonId);
  }

  if (bookedLessonId) {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl p-6 text-center space-y-3">
        <div className="text-emerald-700 text-3xl">✓</div>
        <h2 className="text-lg font-semibold">振替の登録が完了しました</h2>
        <p className="text-sm text-slate-600">
          <span className="block">
            欠席:{" "}
            {source
              ? `${formatDateLong(source.lessonDate)} ${periodLabel(source.period)}${timeSuffix(source.lessonDate, source.period, source.subject, student.classroom)} ${source.subject}`
              : "—"}
          </span>
          <span className="block mt-1">
            振替先: {formatDateLong(selectedDate)}
            {bookedDest
              ? ` ${periodLabel(bookedDest.period)}${timeSuffix(selectedDate, bookedDest.period, bookedDest.subject, bookedDest.classroom)} ${bookedDest.subject}（${bookedDest.classroom}）`
              : ""}
          </span>
          <span className="block mt-3">
            {student.name}
            さんの予定は、この内容ですぐに反映されています。承認などの手続きをお待ちいただく必要はありません。当日は振替先の日時でお越しください。変更やキャンセルが必要な場合は教室へご連絡ください。
          </span>
        </p>
        <p className="text-xs text-slate-400">
          控え（お問い合わせ時に使えます）: {bookedLessonId.slice(0, 8)}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button
            type="button"
            onClick={() => {
              setBookedLessonId(null);
              setBookedDest(null);
              setSubmitError(null);
              setSource(null);
              fetchAvailability(selectedDate);
            }}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
          >
            別の日も申請する
          </button>
          <button
            type="button"
            onClick={onBack}
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
            {student.name}{" "}
            <span className="text-xs text-slate-500 font-normal">
              ({student.grade} / {student.classroom})
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-brand-600 hover:underline shrink-0"
        >
          別の生徒で申請
        </button>
      </div>

      {/* 欠席する授業（振替の元） */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-1">
          1. 欠席する授業（振替の元）を選ぶ
        </p>
        <p className="text-xs text-slate-500 mb-3">
          教室で登録されている「出席予定」のカードだけが表示されます。欠席にしたいコマをタップして選んでください（日付の自由入力はできません）。
        </p>
        {suggestError ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            {suggestError}
          </p>
        ) : null}
        {suggestions === null ? (
          <div className="h-16 rounded-xl border border-slate-200 bg-slate-50 animate-pulse mb-2" />
        ) : suggestions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {suggestions.map((row) => {
              const dow = dowOf(row.lesson_date);
              const picked =
                source?.lessonDate === row.lesson_date &&
                source?.period === row.period &&
                source?.subject === row.subject;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setSource({
                      lessonDate: row.lesson_date,
                      period: row.period,
                      subject: row.subject,
                    });
                    setSubmitError(null);
                  }}
                  className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition ${
                    picked
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                      : "border-slate-200 hover:border-brand-400 hover:shadow"
                  }`}
                >
                  <div className={`text-[11px] font-semibold ${dayColor(dow)}`}>
                    {dayLabel(dow, "long")}
                  </div>
                  <div className="text-base font-bold text-slate-900 mt-0.5 leading-snug">
                    {formatDateLong(row.lesson_date)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">
                      {periodLabel(row.period)}
                      {timeSuffix(row.lesson_date, row.period, row.subject, student.classroom)}
                    </span>
                    <span className="text-xs font-medium rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 ring-1 ring-slate-200/80">
                      {row.subject}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 leading-relaxed">
            <p className="font-semibold mb-1">表示できる出席予定がありません</p>
            <p>
              振替の欠席元は、ここに表示される出席予定のカードからのみ選べます。一覧にない日程を欠席にしたい場合は、所属教室までお問い合わせください。
            </p>
          </div>
        )}

        {source ? (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-2">
            選択中の欠席: {formatDateLong(source.lessonDate)}{" "}
            {periodLabel(source.period)}
            {timeSuffix(source.lessonDate, source.period, source.subject, student.classroom)}{" "}
            {source.subject}
          </p>
        ) : suggestions !== null && suggestions.length > 0 ? (
          <p className="text-xs text-slate-500 mt-2">
            上の出席予定カードを選ぶと、振替先の日付・コマを選べます。
          </p>
        ) : null}
      </div>

      <div
        className={
          !source ? "opacity-50 pointer-events-none select-none" : ""
        }
        aria-hidden={!source}
      >
      {/* 日付選択 */}
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">
          2. 振替先の日付を選ぶ
        </p>
        <p className="text-xs text-slate-500 mb-2">
          今日〜{formatDateLong(maxDate)} まで選べます。カレンダーで直接指定するか、下の日付帯から選んでください。
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
              if (isValidDate(v)) setSelectedDate(v);
            }}
            className={inputClass}
          />
        </label>
        <div
          className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory"
          role="tablist"
        >
          {dates.map((d) => {
            const dow = new Date(d).getDay();
            const isSelected = d === selectedDate;
            const day = new Date(`${d}T00:00:00`).getDate();
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`snap-start shrink-0 w-16 rounded-xl border px-1 py-2 text-center transition ${
                  isSelected
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <div className={`text-[10px] ${dayColor(dow)}`}>
                  {dayLabel(dow)}
                </div>
                <div className="text-xl font-bold leading-tight">{day}</div>
                <div className="text-[10px] text-slate-500">{d.slice(5, 7)}/月</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 空き状況 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">
            3. 空いているコマを選ぶ
          </p>
          <p className="text-[10px] text-slate-400">
            {loading
              ? "更新中…"
              : lastUpdated
                ? `${lastUpdated.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 更新`
                : ""}
          </p>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          各教室の空き枠が一覧されます。所属教室以外の会場で振替を受けたい場合も、ここから選べます。
        </p>

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
        ) : slots.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-sm text-slate-500">
            この日に空きのある振替枠はありません。別の日付をお選びください。
          </div>
        ) : (
          <ul className="space-y-2">
            {slots.map((slot) => {
              const isFull = slot.available <= 0;
              const isStudentSubject = studentSubjects.has(slot.subject);
              const disabled =
                isFull || submitting || !isStudentSubject || confirmSlot !== null;
              return (
                <li key={`${slot.classroom}-${slot.period}-${slot.subject}`}>
                  <button
                    type="button"
                    onClick={() => openMakeupConfirm(slot)}
                    disabled={disabled}
                    className={`w-full text-left rounded-xl border p-4 flex items-center justify-between gap-3 transition ${
                      disabled
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
                        {!isStudentSubject ? (
                          <span className="text-[10px] text-slate-500">
                            (受講していない教科)
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        振替申込 {slot.occupied} / {slot.max_students} 名
                      </p>
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

      </div>

      <p className="text-[11px] text-slate-400 text-center">
        空き状況は他の方の申請に応じて自動的に更新されます。
      </p>

      {confirmSlot && source ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="makeup-confirm-title"
          onClick={() => !submitting && setConfirmSlot(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="makeup-confirm-title"
              className="text-lg font-semibold text-slate-900 leading-snug"
            >
              この日程で振替を登録しても良いですか？
            </h2>
            <div className="text-sm text-slate-700 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">
                  欠席する授業
                </p>
                <p>
                  {formatDateLong(source.lessonDate)}{" "}
                  {periodLabel(source.period)}
                  {timeSuffix(source.lessonDate, source.period, source.subject, student.classroom)}{" "}
                  {source.subject}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">振替先</p>
                <p>
                  {formatDateLong(selectedDate)}{" "}
                  {periodLabel(confirmSlot.period)}
                  {timeSuffix(
                    selectedDate,
                    confirmSlot.period,
                    confirmSlot.subject,
                    confirmSlot.classroom
                  )}{" "}
                  {confirmSlot.subject}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  実施会場: {confirmSlot.classroom}
                </p>
              </div>
              <p className="text-xs text-slate-500 pt-1 border-t border-slate-200">
                {student.name} さんの予定として登録されます。
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirmSlot(null)}
                className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2.5 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitMakeupFromModal()}
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

/** 教科を CourseSubject 型にナローイング (使い回し用) */
export function asCourseSubject(s: string): CourseSubject | null {
  return s === "プログラミング" || s === "ロボット" ? s : null;
}
