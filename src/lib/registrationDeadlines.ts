import { shiftDate } from "@/lib/date";
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
