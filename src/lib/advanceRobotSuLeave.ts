import { shiftMonth } from "@/lib/date";
import { lessonYearMonth } from "@/lib/studentLeave";
import { ROBOT_COURSE_ADV } from "@/lib/robotCoursePromotion";

const ADV_SU1 = `${ROBOT_COURSE_ADV} / 1周目 / SU1`;
const ADV_SU2 = `${ROBOT_COURSE_ADV} / 1周目 / SU2`;

export function isAdvanceRobotSuCombined(
  full: string | null | undefined
): boolean {
  const t = full?.trim();
  return t === ADV_SU1 || t === ADV_SU2;
}

export function isAdvanceRobotSu2Combined(
  full: string | null | undefined
): boolean {
  return full?.trim() === ADV_SU2;
}

/**
 * SU を偶数月に実施したとき、翌奇数月（1ヶ月）を休会とする。
 * 偶数月+奇数月で1教材のため、SU後の奇数月は教材を進めない。
 */
export function advanceSuRestMonthAfterEvenSu(
  lessonDate: string
): string | null {
  const month = Number(lessonDate.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (month % 2 !== 0) return null;

  const restYm = shiftMonth(lessonYearMonth(lessonDate), 1);
  const restMonth = Number(restYm.slice(5, 7));
  if (restMonth % 2 === 0) return null;

  return restYm;
}
