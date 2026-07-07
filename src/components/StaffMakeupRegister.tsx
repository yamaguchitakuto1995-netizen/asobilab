"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClassroomBadge } from "@/components/ClassroomBadge";
import { inputClass } from "@/components/Field";
import { SubjectChip } from "@/components/SubjectChip";
import { formatDateLong, isValidDate } from "@/lib/date";
import { dayColor, dayLabel, dowOf } from "@/lib/days";
import {
  enumerateDatesInclusive,
  formatMakeupTargetMaxLabel,
  isSameMakeupSourceAndTarget,
  isStudentSlotOccupied,
  sameMakeupSourceAndTargetMessage,
  studentSlotOccupiedMessage,
  todayJstIso,
} from "@/lib/registrationDeadlines";
import {
  formatTimeRange,
  resolveClassroomPeriodTime,
} from "@/lib/periodTimes";
import { makeupTargetDateRangeForStaff, type StaffLessonOption } from "@/lib/staffMakeupLessons";
import {
  bookMakeupLessonForStaff,
  listStaffMakeupLessons,
  markLessonAbsentForStaff,
} from "@/app/(dashboard)/students/[id]/makeup/actions";
import {
  periodLabel,
  SCHEDULED_ATTENDANCE_LABEL,
  type ClassroomPeriodTime,
  type CourseSubject,
  type SlotAvailability,
} from "@/lib/types";

type FlowTab = "absence" | "makeup" | "both";

type Props = {
  studentId: string;
  studentName: string;
  classroom: string;
  subjects: string[];
  periodTimes?: ClassroomPeriodTime[];
};

type SourceSelection = {
  lessonDate: string;
  period: number;
  subject: string;
  kind: "attendance" | "pending_absence";
  lessonClassroom?: string | null;
};

const FLOW_TABS: { id: FlowTab; label: string; hint: string }[] = [
  {
    id: "absence",
    label: "欠席のみ",
    hint: "振替先は後から登録できます",
  },
  {
    id: "makeup",
    label: "振替のみ",
    hint: "欠席済みの授業から振替先を選びます",
  },
  {
    id: "both",
    label: "まとめて",
    hint: "欠席と振替を一度に登録します",
  },
];

export function StaffMakeupRegister({
  studentId,
  studentName,
  classroom,
  subjects,
  periodTimes = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [flowTab, setFlowTab] = useState<FlowTab>("both");
  const [attendanceSources, setAttendanceSources] = useState<
    StaffLessonOption[] | null
  >(null);
  const [pendingAbsences, setPendingAbsences] = useState<
    StaffLessonOption[] | null
  >(null);
  const [listError, setListError] = useState<string | null>(null);
  const [source, setSource] = useState<SourceSelection | null>(null);
  const [selectedDate, setSelectedDate] = useState(todayJstIso());
  const [dest, setDest] = useState<SlotAvailability | null>(null);
  const [slots, setSlots] = useState<SlotAvailability[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"absence" | "makeup" | null>(
    null
  );
  const [completed, setCompleted] = useState<
    | { mode: "absence"; source: SourceSelection }
    | { mode: "makeup"; source: SourceSelection; dest: SlotAvailability }
    | null
  >(null);

  const showAttendanceSources = flowTab === "absence" || flowTab === "both";
  const showPendingSources = flowTab === "makeup";
  const needsMakeupSteps = flowTab === "makeup" || flowTab === "both";

  const displayOptions = showPendingSources
    ? pendingAbsences
    : attendanceSources;

  const sourceLessonDates = source ? [source.lessonDate] : [];
  const targetRange = useMemo(
    () => makeupTargetDateRangeForStaff(sourceLessonDates),
    [sourceLessonDates.join(",")]
  );

  const periodTimeDates = useMemo(() => {
    const set = new Set<string>();
    for (const row of periodTimes) {
      if (row.lesson_date) set.add(row.lesson_date);
    }
    return set;
  }, [periodTimes]);

  const dates = useMemo(() => {
    const raw = enumerateDatesInclusive(targetRange.min, targetRange.max);
    return raw.filter((d) => periodTimeDates.has(d));
  }, [targetRange.min, targetRange.max, periodTimeDates]);

  const allLessons = useMemo(
    () => [...(attendanceSources ?? []), ...(pendingAbsences ?? [])],
    [attendanceSources, pendingAbsences]
  );

  const loadLessons = useCallback(async () => {
    setListError(null);
    setAttendanceSources(null);
    setPendingAbsences(null);
    const result = await listStaffMakeupLessons({ studentId });
    if (!result.ok) {
      setListError(result.error);
      setAttendanceSources([]);
      setPendingAbsences([]);
      return;
    }
    setAttendanceSources(result.attendanceSources);
    setPendingAbsences(result.pendingAbsences);
  }, [studentId]);

  useEffect(() => {
    if (!open) return;
    void loadLessons();
  }, [open, loadLessons]);

  useEffect(() => {
    if (!open || !needsMakeupSteps || !source) return;
    if (!dates.includes(selectedDate) && dates.length > 0) {
      setSelectedDate(dates[0]!);
      setDest(null);
    }
  }, [open, needsMakeupSteps, source, dates, selectedDate]);

  const fetchAvailability = useCallback(async (date: string) => {
    setLoadingSlots(true);
    setSlotError(null);
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
      setSlots(body.slots);
    } catch (e) {
      setSlotError(e instanceof Error ? e.message : String(e));
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !needsMakeupSteps || !source) return;
    void fetchAvailability(selectedDate);
  }, [open, needsMakeupSteps, source, selectedDate, fetchAvailability]);

  function resetSelections() {
    setSource(null);
    setDest(null);
    setSubmitError(null);
    setConfirmOpen(false);
    setConfirmMode(null);
  }

  function switchFlowTab(tab: FlowTab) {
    setFlowTab(tab);
    resetSelections();
  }

  function pickSource(row: StaffLessonOption, kind: SourceSelection["kind"]) {
    setSource({
      lessonDate: row.lesson_date,
      period: row.period,
      subject: row.subject,
      kind,
      lessonClassroom: row.lesson_classroom,
    });
    setDest(null);
    setSubmitError(null);
  }

  function pickDest(slot: SlotAvailability) {
    if (!source) {
      setSubmitError(
        flowTab === "makeup"
          ? "先に「欠席済みの授業」を選んでください。"
          : "先に「欠席する授業」を選んでください。"
      );
      return;
    }
    if (
      isSameMakeupSourceAndTarget(
        {
          lessonDate: source.lessonDate,
          period: source.period,
          subject: source.subject,
        },
        {
          lessonDate: selectedDate,
          period: slot.period,
          subject: slot.subject,
        }
      )
    ) {
      setSubmitError(sameMakeupSourceAndTargetMessage());
      return;
    }
    if (
      isStudentSlotOccupied(allLessons, {
        lessonDate: selectedDate,
        period: slot.period,
        subject: slot.subject,
        excludeSource: {
          lessonDate: source.lessonDate,
          period: source.period,
          subject: source.subject,
        },
      })
    ) {
      setSubmitError(studentSlotOccupiedMessage());
      return;
    }
    setDest(slot);
    setSubmitError(null);
    setConfirmMode("makeup");
    setConfirmOpen(true);
  }

  async function submitAbsenceOnly() {
    if (!source || submitting) return;
    if (source.kind === "pending_absence") {
      setSubmitError("欠席済みの授業は「欠席のみ」では登録できません。");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const result = await markLessonAbsentForStaff({
      studentId,
      lessonDate: source.lessonDate,
      period: source.period,
      subject: source.subject,
    });
    setSubmitting(false);
    setConfirmOpen(false);
    setConfirmMode(null);
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    setCompleted({ mode: "absence", source });
    void loadLessons();
  }

  async function submitMakeup() {
    if (!source || !dest || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await bookMakeupLessonForStaff({
      studentId,
      lessonDate: selectedDate,
      period: dest.period,
      subject: dest.subject,
      sourceLessonDate: source.lessonDate,
      sourcePeriod: source.period,
      sourceSubject: source.subject,
      lessonClassroom: dest.classroom,
    });
    setSubmitting(false);
    setConfirmOpen(false);
    setConfirmMode(null);
    if (!result.ok) {
      setSubmitError(result.error);
      void fetchAvailability(selectedDate);
      return;
    }
    setCompleted({ mode: "makeup", source, dest });
    void loadLessons();
    void fetchAvailability(selectedDate);
  }

  function timeSuffix(
    date: string,
    period: number,
    subject: string,
    venue: string
  ): string {
    if (!periodTimes.length) return "";
    const row = resolveClassroomPeriodTime(periodTimes, {
      classroom: venue,
      lessonDate: date,
      period,
      subject,
    });
    return row ? ` · ${formatTimeRange(row.start_time, row.end_time)}` : "";
  }

  const enrolledSet = useMemo(() => new Set(subjects), [subjects]);
  const visibleSlots = (slots ?? []).filter((slot) =>
    enrolledSet.has(slot.subject as CourseSubject)
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-brand-300 bg-brand-50 hover:bg-brand-100 text-brand-800 text-sm font-medium px-3 py-2"
      >
        欠席・振替を登録
      </button>
    );
  }

  if (completed) {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl p-5 space-y-4">
        <div className="text-center">
          <div className="text-emerald-700 text-2xl">✓</div>
          <h3 className="text-base font-semibold mt-2">
            {completed.mode === "absence"
              ? "欠席の登録が完了しました"
              : "振替の登録が完了しました"}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {studentName} さん（職員登録）
          </p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5 text-sm text-slate-700">
          <p>
            欠席: {formatDateLong(completed.source.lessonDate)}{" "}
            {periodLabel(completed.source.period)}{" "}
            {completed.source.subject}
          </p>
          {completed.mode === "makeup" ? (
            <p className="mt-1">
              振替先: {formatDateLong(selectedDate)}{" "}
              {periodLabel(completed.dest.period)}{" "}
              {completed.dest.subject}（{completed.dest.classroom}）
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setCompleted(null);
              resetSelections();
            }}
            className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-3 py-2"
          >
            別の登録をする
          </button>
          <button
            type="button"
            onClick={() => {
              setCompleted(null);
              setOpen(false);
              resetSelections();
            }}
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3 py-2"
          >
            閉じる
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-brand-200 rounded-2xl p-4 sm:p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">欠席・振替の登録（職員用）</h3>
          <p className="text-xs text-slate-500 mt-1">
            保護者から口頭で連絡があった場合に登録します。保護者向けの申請締切は適用しません。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            resetSelections();
          }}
          className="text-xs text-slate-500 hover:text-slate-700 shrink-0"
        >
          閉じる
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {FLOW_TABS.map((tab) => {
          const active = flowTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchFlowTab(tab.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                  : "border-slate-200 bg-white hover:border-brand-300"
              }`}
            >
              <span className="block text-sm font-semibold text-slate-900">
                {tab.label}
              </span>
              <span className="block text-[11px] text-slate-500 mt-0.5">
                {tab.hint}
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <p className="text-sm font-semibold text-slate-700 mb-1">
          {showPendingSources
            ? "1. 欠席済みの授業を選ぶ"
            : "1. 欠席する授業を選ぶ"}
        </p>
        {listError ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            {listError}
          </p>
        ) : null}
        {displayOptions === null ? (
          <div className="h-16 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />
        ) : displayOptions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {displayOptions.map((row) => {
              const venue = row.lesson_classroom?.trim() || classroom;
              const picked =
                source?.lessonDate === row.lesson_date &&
                source?.period === row.period &&
                source?.subject === row.subject;
              const kind: SourceSelection["kind"] = showPendingSources
                ? "pending_absence"
                : "attendance";
              const attendanceLabel =
                row.attendance === "absent"
                  ? SCHEDULED_ATTENDANCE_LABEL.absent
                  : row.attendance === "makeup"
                    ? SCHEDULED_ATTENDANCE_LABEL.makeup
                    : SCHEDULED_ATTENDANCE_LABEL.present;

              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => pickSource(row, kind)}
                  className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition ${
                    picked
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                      : "border-slate-200 hover:border-brand-400 hover:shadow"
                  }`}
                >
                  <div
                    className={`text-[11px] font-semibold ${dayColor(dowOf(row.lesson_date))}`}
                  >
                    {dayLabel(dowOf(row.lesson_date), "long")}
                  </div>
                  <div className="text-base font-bold text-slate-900 mt-0.5">
                    {formatDateLong(row.lesson_date)}
                  </div>
                  <div className="text-sm text-slate-700 mt-1">
                    {periodLabel(row.period)}
                    {timeSuffix(
                      row.lesson_date,
                      row.period,
                      row.subject,
                      venue
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <SubjectChip subject={row.subject} />
                    <ClassroomBadge classroom={venue} size="sm" />
                    <span className="text-[10px] rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">
                      {attendanceLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            {showPendingSources
              ? "振替先を選べる欠席済みの授業がありません。"
              : "欠席にできる予定がありません。"}
          </div>
        )}

        {source ? (
          <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mt-3">
            選択中: {formatDateLong(source.lessonDate)}{" "}
            {periodLabel(source.period)} {source.subject}
          </p>
        ) : null}

        {flowTab === "absence" && source ? (
          <button
            type="button"
            onClick={() => {
              setConfirmMode("absence");
              setConfirmOpen(true);
            }}
            disabled={submitting}
            className="mt-4 w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 disabled:opacity-60"
          >
            欠席を登録する
          </button>
        ) : null}
        {flowTab === "both" && source ? (
          <button
            type="button"
            onClick={() => {
              setConfirmMode("absence");
              setConfirmOpen(true);
            }}
            disabled={submitting}
            className="mt-4 w-full rounded-lg border border-brand-300 bg-white hover:bg-brand-50 text-brand-800 text-sm font-medium px-4 py-2.5 disabled:opacity-60"
          >
            欠席のみ登録する（振替は後で）
          </button>
        ) : null}
      </div>

      {needsMakeupSteps ? (
        <div className={!source ? "opacity-50 pointer-events-none" : ""}>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">
              2. 振替先の日付を選ぶ
            </p>
            {source ? (
              <p className="text-xs text-slate-500 mb-2">
                職員登録のため保護者向けの3日前締切は適用しません。上限は欠席月の翌々月末（
                {formatMakeupTargetMaxLabel(source.lessonDate)} まで）です。
              </p>
            ) : null}
            <label className="block mb-3">
              <span className="sr-only">振替先の日付</span>
              <input
                type="date"
                min={targetRange.min}
                max={targetRange.max}
                value={selectedDate}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isValidDate(v)) {
                    setSelectedDate(v);
                    setDest(null);
                  }
                }}
                className={inputClass}
              />
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2 snap-x">
              {dates.map((d) => {
                const dow = new Date(`${d}T00:00:00`).getDay();
                const isSelected = d === selectedDate;
                const day = new Date(`${d}T00:00:00`).getDate();
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedDate(d);
                      setDest(null);
                    }}
                    className={`snap-start shrink-0 w-16 rounded-xl border px-1 py-2 text-center ${
                      isSelected
                        ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className={`text-[10px] ${dayColor(dow)}`}>
                      {dayLabel(dow)}
                    </div>
                    <div className="text-xl font-bold">{day}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <p className="text-sm font-semibold text-slate-700 mb-2">
              3. 振替先のコマを選ぶ
            </p>
            <p className="text-xs text-slate-500 mb-2">
              満員のコマも職員登録では選べます（定員超過で登録されます）。
            </p>
            {slotError ? (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">
                {slotError}
              </p>
            ) : null}
            {submitError ? (
              <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-2">
                {submitError}
              </p>
            ) : null}
            {slots === null || loadingSlots ? (
              <div className="h-24 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />
            ) : visibleSlots.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-4 text-center text-sm text-slate-500">
                {periodTimeDates.has(selectedDate)
                  ? "この日に空きのある振替枠はありません。"
                  : "この日はコマ時刻が登録されていないため、振替先に選べません。"}
              </div>
            ) : (
              <ul className="space-y-2">
                {visibleSlots.map((slot) => {
                  const isFull = slot.available <= 0;
                  const sameAsSource =
                    source &&
                    isSameMakeupSourceAndTarget(
                      {
                        lessonDate: source.lessonDate,
                        period: source.period,
                        subject: source.subject,
                      },
                      {
                        lessonDate: selectedDate,
                        period: slot.period,
                        subject: slot.subject,
                      }
                    );
                  const studentOccupied =
                    source &&
                    !sameAsSource &&
                    isStudentSlotOccupied(allLessons, {
                      lessonDate: selectedDate,
                      period: slot.period,
                      subject: slot.subject,
                      excludeSource: {
                        lessonDate: source.lessonDate,
                        period: source.period,
                        subject: source.subject,
                      },
                    });
                  const disabled = Boolean(sameAsSource || studentOccupied);
                  return (
                    <li key={`${slot.classroom}:${slot.period}:${slot.subject}`}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => pickDest(slot)}
                        className={`w-full text-left rounded-xl border px-4 py-3 transition ${
                          disabled
                            ? "border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed"
                            : isFull
                              ? dest?.period === slot.period &&
                                  dest.subject === slot.subject &&
                                  dest.classroom === slot.classroom
                                ? "border-amber-500 bg-amber-50 ring-2 ring-amber-200"
                                : "border-amber-200 bg-amber-50/60 hover:border-amber-400"
                              : dest?.period === slot.period &&
                                  dest.subject === slot.subject &&
                                  dest.classroom === slot.classroom
                                ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                                : "border-slate-200 bg-white hover:border-brand-400"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-slate-900">
                                {periodLabel(slot.period)}
                              </span>
                              <ClassroomBadge
                                classroom={slot.classroom}
                                size="sm"
                              />
                              <span className="text-sm text-slate-600">
                                {slot.subject}
                              </span>
                            </div>
                            {timeSuffix(
                              selectedDate,
                              slot.period,
                              slot.subject,
                              slot.classroom
                            ) ? (
                              <p className="text-xs text-slate-500 mt-1">
                                {timeSuffix(
                                  selectedDate,
                                  slot.period,
                                  slot.subject,
                                  slot.classroom
                                ).replace(/^ · /, "")}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className={`text-[10px] font-medium ${
                                isFull ? "text-amber-800" : "text-slate-500"
                              }`}
                            >
                              {isFull
                                ? `定員超過 ${slot.occupied}/${slot.max_students}`
                                : `空き ${slot.available} / ${slot.max_students}`}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <h4 className="text-base font-semibold">
              {confirmMode === "absence" ? "欠席を登録しますか？" : "振替を登録しますか？"}
            </h4>
            {source ? (
              <div className="text-sm text-slate-700 space-y-1">
                <p>
                  生徒: <span className="font-medium">{studentName}</span>
                </p>
                <p>
                  欠席: {formatDateLong(source.lessonDate)}{" "}
                  {periodLabel(source.period)} {source.subject}
                </p>
                {confirmMode === "makeup" && dest ? (
                  <>
                    <p>
                      振替先: {formatDateLong(selectedDate)}{" "}
                      {periodLabel(dest.period)} {dest.subject}（{dest.classroom}）
                    </p>
                    {dest.available <= 0 ? (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                        このコマは定員超過です。職員登録として受け付けます。
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setConfirmOpen(false);
                  setConfirmMode(null);
                }}
                disabled={submitting}
                className="rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium px-4 py-2"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmMode === "absence") void submitAbsenceOnly();
                  else void submitMakeup();
                }}
                disabled={submitting}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 disabled:opacity-60"
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
