import { formatDateShort, shiftDate, shiftMonth } from "@/lib/date";
import { formatClock, resolveClassroomPeriodTime } from "@/lib/periodTimes";
import type { ClassroomPeriodTime } from "@/lib/types";

const JST = "Asia/Tokyo";

/** 振替申請: 授業日の何日前 23:59 までか */
export const MAKEUP_REGISTRATION_DAYS_BEFORE = 3;

/** 振替未登録の欠席一覧を遡って検索する日数（過去分の手動登録分を含める） */
export const MAKEUP_PENDING_ABSENCE_LOOKBACK_DAYS = 730;

/** list_pending_absences 系 RPC / 職員向け一覧の開始日 */
export function makeupPendingAbsenceFromDate(now = new Date()): string {
  return shiftDate(todayJstIso(now), -MAKEUP_PENDING_ABSENCE_LOOKBACK_DAYS);
}

export function todayJstIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 授業日から振替申請締切日（YYYY-MM-DD）を返す */
export function makeupRegistrationDeadlineDate(
  sourceLessonDate: string
): string {
  return shiftDate(sourceLessonDate, -MAKEUP_REGISTRATION_DAYS_BEFORE);
}

function jstDateTimeToMs(dateIso: string, time: string): number {
  const normalized = time.length >= 8 ? time.slice(0, 8) : `${time}:00`;
  return new Date(`${dateIso}T${normalized}+09:00`).getTime();
}

export function formatMakeupDeadlineLabel(sourceLessonDate: string): string {
  const d = makeupRegistrationDeadlineDate(sourceLessonDate);
  const date = new Date(`${d}T00:00:00`);
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${w}) 23:59`;
}

export function isMakeupRegistrationOpen(
  sourceLessonDate: string,
  now = new Date()
): boolean {
  const deadlineDate = makeupRegistrationDeadlineDate(sourceLessonDate);
  const deadlineMs = jstDateTimeToMs(deadlineDate, "23:59:59");
  return now.getTime() <= deadlineMs;
}

export function makeupRegistrationClosedMessage(
  sourceLessonDate: string
): string {
  return `振替申請は授業日の${MAKEUP_REGISTRATION_DAYS_BEFORE}日前（${formatMakeupDeadlineLabel(sourceLessonDate)}）までです。`;
}

export function makeupTargetBookingClosedMessage(
  targetLessonDate: string
): string {
  return `振替先の授業は授業日の${MAKEUP_REGISTRATION_DAYS_BEFORE}日前（${formatMakeupDeadlineLabel(targetLessonDate)}）までに申請してください。`;
}

/** 欠席済み授業の振替登録締切日（翌々月末の3日前 23:59） */
export function pendingAbsenceMakeupRegistrationDeadlineDate(
  sourceLessonDate: string
): string {
  return shiftDate(
    makeupTargetMaxDate(sourceLessonDate),
    -MAKEUP_REGISTRATION_DAYS_BEFORE
  );
}

/** 欠席済み授業への振替登録がまだ可能か（翌々月末の3日前 23:59 まで） */
export function isPendingAbsenceMakeupOpen(
  sourceLessonDate: string,
  now = new Date()
): boolean {
  const deadlineDate = pendingAbsenceMakeupRegistrationDeadlineDate(
    sourceLessonDate
  );
  const deadlineMs = jstDateTimeToMs(deadlineDate, "23:59:59");
  return now.getTime() <= deadlineMs;
}

export function formatPendingAbsenceMakeupDeadlineLabel(
  sourceLessonDate: string
): string {
  const d = pendingAbsenceMakeupRegistrationDeadlineDate(sourceLessonDate);
  const date = new Date(`${d}T00:00:00`);
  const w = ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${w}) 23:59`;
}

export function pendingAbsenceMakeupClosedMessage(
  sourceLessonDate: string
): string {
  const max = makeupTargetMaxDate(sourceLessonDate);
  const maxLabel = formatDateShort(max);
  return `振替登録は欠席月の翌々月末（${maxLabel}）の${MAKEUP_REGISTRATION_DAYS_BEFORE}日前（${formatPendingAbsenceMakeupDeadlineLabel(sourceLessonDate)}）までです。`;
}

export function canRegisterAbsence(
  opts: {
    lessonDate: string;
    period: number;
    subject: string;
    classroom: string | null;
    periodTimes: ClassroomPeriodTime[];
  },
  now = new Date()
): { ok: true } | { ok: false; error: string } {
  const today = todayJstIso(now);

  if (opts.lessonDate < today) {
    return {
      ok: false,
      error: "この授業はすでに終了しているため、欠席登録できません。",
    };
  }

  if (opts.lessonDate > today) {
    return { ok: true };
  }

  const row = resolveClassroomPeriodTime(opts.periodTimes, {
    classroom: opts.classroom,
    lessonDate: opts.lessonDate,
    period: opts.period,
    subject: opts.subject,
  });

  if (!row) {
    return { ok: true };
  }

  const startMs = jstDateTimeToMs(opts.lessonDate, row.start_time);
  if (now.getTime() >= startMs) {
    return {
      ok: false,
      error: `授業開始時刻（${formatClock(row.start_time)}）を過ぎたため、欠席登録できません。`,
    };
  }

  return { ok: true };
}

export function isAbsenceSourceSelectable(
  opts: {
    lessonDate: string;
    period: number;
    subject: string;
    classroom: string | null;
    periodTimes: ClassroomPeriodTime[];
  },
  now = new Date()
): boolean {
  return canRegisterAbsence(opts, now).ok;
}

export function isMakeupSourceSelectable(
  sourceLessonDate: string,
  now = new Date()
): boolean {
  return isMakeupRegistrationOpen(sourceLessonDate, now);
}

/** 欠席月の翌々月末（振替先を選べる最遅日） */
export function makeupTargetMaxDate(sourceLessonDate: string): string {
  const ym = sourceLessonDate.slice(0, 7);
  const endYm = shiftMonth(ym, 2);
  const [y, m] = endYm.split("-").map(Number);
  const lastDay = new Date(y, m, 0);
  const mm = String(lastDay.getMonth() + 1).padStart(2, "0");
  const dd = String(lastDay.getDate()).padStart(2, "0");
  return `${lastDay.getFullYear()}-${mm}-${dd}`;
}

/** 振替先として選べる最早日（3日前 23:59 締切を満たす最初の日） */
export function earliestMakeupTargetDate(now = new Date()): string {
  const today = todayJstIso(now);
  let d = today;
  for (let i = 0; i < 366; i++) {
    if (isMakeupRegistrationOpen(d, now)) {
      return d;
    }
    d = shiftDate(d, 1);
  }
  return shiftDate(today, MAKEUP_REGISTRATION_DAYS_BEFORE);
}

export function formatEarliestMakeupTargetLabel(now = new Date()): string {
  return formatDateShort(earliestMakeupTargetDate(now));
}

/** 振替先の最早日（欠席月の1日以降かつ3日前締切を満たす日の遅い方） */
export function makeupTargetMinDate(
  sourceLessonDate: string,
  now = new Date()
): string {
  const sourceMonthStart = `${sourceLessonDate.slice(0, 7)}-01`;
  const leadTimeMin = earliestMakeupTargetDate(now);
  return sourceMonthStart > leadTimeMin ? sourceMonthStart : leadTimeMin;
}

export function formatMakeupTargetMaxLabel(sourceLessonDate: string): string {
  return formatDateShort(makeupTargetMaxDate(sourceLessonDate));
}

/** 振替先日付が欠席元に対して有効か */
export function validateMakeupTargetDate(
  sourceLessonDate: string,
  targetLessonDate: string,
  now = new Date()
): { ok: true } | { ok: false; error: string } {
  const sourceYm = sourceLessonDate.slice(0, 7);
  const targetYm = targetLessonDate.slice(0, 7);

  if (targetYm < sourceYm) {
    return {
      ok: false,
      error:
        "振替先は欠席月より前の月には設定できません。同月内であれば前の日付への振替が可能です。",
    };
  }

  if (!isMakeupRegistrationOpen(targetLessonDate, now)) {
    return {
      ok: false,
      error: makeupTargetBookingClosedMessage(targetLessonDate),
    };
  }

  const min = makeupTargetMinDate(sourceLessonDate, now);
  if (targetLessonDate < min) {
    return {
      ok: false,
      error: `振替先の日付は ${formatDateShort(min)} 以降を選んでください。`,
    };
  }

  const max = makeupTargetMaxDate(sourceLessonDate);
  if (targetLessonDate > max) {
    return {
      ok: false,
      error: `振替先は欠席月の翌々月末（${formatMakeupTargetMaxLabel(sourceLessonDate)}）まで選べます。`,
    };
  }

  return { ok: true };
}

/** 振替先コマがまだ予約可能か（3日前 23:59 締切・当日は開始時刻まで） */
export function canBookMakeupTarget(
  opts: {
    lessonDate: string;
    period: number;
    subject: string;
    classroom: string | null;
    periodTimes: ClassroomPeriodTime[];
  },
  now = new Date()
): { ok: true } | { ok: false; error: string } {
  if (!isMakeupRegistrationOpen(opts.lessonDate, now)) {
    return {
      ok: false,
      error: makeupTargetBookingClosedMessage(opts.lessonDate),
    };
  }

  const today = todayJstIso(now);

  if (opts.lessonDate < today) {
    return {
      ok: false,
      error: "振替先の授業はすでに終了しているため、登録できません。",
    };
  }

  if (opts.lessonDate > today) {
    return { ok: true };
  }

  const row = resolveClassroomPeriodTime(opts.periodTimes, {
    classroom: opts.classroom,
    lessonDate: opts.lessonDate,
    period: opts.period,
    subject: opts.subject,
  });

  if (!row) {
    return { ok: true };
  }

  const startMs = jstDateTimeToMs(opts.lessonDate, row.start_time);
  if (now.getTime() >= startMs) {
    return {
      ok: false,
      error: `振替先の開始時刻（${formatClock(row.start_time)}）を過ぎたため、登録できません。`,
    };
  }

  return { ok: true };
}

/** 複数欠席元があるときの振替先日付レンジ（共通部分） */
export function makeupTargetDateRangeForSources(
  sourceLessonDates: string[],
  now = new Date()
): { min: string; max: string } {
  const today = todayJstIso(now);
  if (sourceLessonDates.length === 0) {
    return { min: earliestMakeupTargetDate(now), max: shiftDate(today, 120) };
  }
  const mins = sourceLessonDates.map((d) => makeupTargetMinDate(d, now));
  const maxs = sourceLessonDates.map((d) => makeupTargetMaxDate(d));
  return {
    min: mins.sort().reverse()[0]!,
    max: maxs.sort()[0]!,
  };
}

/** min〜max の日付配列（YYYY-MM-DD） */
export function enumerateDatesInclusive(min: string, max: string): string[] {
  if (min > max) return [];
  const arr: string[] = [];
  let d = min;
  while (d <= max) {
    arr.push(d);
    d = shiftDate(d, 1);
  }
  return arr;
}

export type StudentLessonSlot = {
  lesson_date: string;
  period: number;
  subject: string;
};

/** 生徒が指定日・コマにすでに授業を持っているか（欠席元コマは除外） */
export function isStudentSlotOccupied(
  lessons: StudentLessonSlot[],
  opts: {
    lessonDate: string;
    period: number;
    subject: string;
    excludeSource?: {
      lessonDate: string;
      period: number;
      subject: string;
    } | null;
  }
): boolean {
  return lessons.some((l) => {
    if (l.lesson_date !== opts.lessonDate || l.period !== opts.period) {
      return false;
    }
    const ex = opts.excludeSource;
    if (
      ex &&
      ex.lessonDate === opts.lessonDate &&
      ex.period === opts.period &&
      ex.subject === opts.subject
    ) {
      return false;
    }
    return true;
  });
}

export function studentSlotOccupiedMessage(): string {
  return "このコマにはすでに授業が登録されているため、振替先に選べません。";
}

/** 振替元と振替先が同じ日・コマ・教科か */
export function isSameMakeupSourceAndTarget(
  source: {
    lessonDate: string;
    period: number;
    subject: string;
  },
  target: {
    lessonDate: string;
    period: number;
    subject: string;
  }
): boolean {
  return (
    source.lessonDate === target.lessonDate &&
    source.period === target.period &&
    source.subject === target.subject
  );
}

export function sameMakeupSourceAndTargetMessage(): string {
  return "同じコマから同じコマへは振替できません。";
}
