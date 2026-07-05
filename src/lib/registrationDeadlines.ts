import { formatDateShort, shiftDate, shiftMonth } from "@/lib/date";
import { formatClock, resolveClassroomPeriodTime } from "@/lib/periodTimes";
import type { ClassroomPeriodTime } from "@/lib/types";

const JST = "Asia/Tokyo";

/** 振替申請: 授業日の何日前 23:59 までか */
export const MAKEUP_REGISTRATION_DAYS_BEFORE = 3;

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

/** 振替先の最早日（欠席月の1日以降かつ今日以降の遅い方） */
export function makeupTargetMinDate(
  sourceLessonDate: string,
  today: string
): string {
  const sourceMonthStart = `${sourceLessonDate.slice(0, 7)}-01`;
  return sourceMonthStart > today ? sourceMonthStart : today;
}

export function formatMakeupTargetMaxLabel(sourceLessonDate: string): string {
  return formatDateShort(makeupTargetMaxDate(sourceLessonDate));
}

/** 振替先日付が欠席元に対して有効か */
export function validateMakeupTargetDate(
  sourceLessonDate: string,
  targetLessonDate: string,
  today: string
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

  const min = makeupTargetMinDate(sourceLessonDate, today);
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

  if (targetLessonDate < today) {
    return {
      ok: false,
      error: "振替先は今日以降の日付を選んでください。",
    };
  }

  return { ok: true };
}

/** 振替先コマがまだ予約可能か（当日は開始時刻まで） */
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
  today: string
): { min: string; max: string } {
  if (sourceLessonDates.length === 0) {
    return { min: today, max: shiftDate(today, 120) };
  }
  const mins = sourceLessonDates.map((d) => makeupTargetMinDate(d, today));
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
