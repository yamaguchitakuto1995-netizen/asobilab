import {
  parseProgrammingNextTextParts,
  parseRobotNextTextParts,
  TWO_LAP_ROBOT_COURSES,
} from "@/lib/courseNextText";

/**
 * 教材の冊数集計用ラベル（1周目・2周目は同一冊のため区別しない）。
 * 例: ミドル（2周） + 1周目 / 7-1 → 「ミドル 7-1」
 */
export function physicalTextbookLabel(course: string, text: string): string {
  const c = course.trim();
  let t = text.trim();
  if (!c || !t) return `${c} ${t}`.trim();

  if (TWO_LAP_ROBOT_COURSES.has(c)) {
    t = t.replace(/^\d+周目\s*\/\s*/, "").trim();
    const shortCourse = c.replace(/（2周）$/, "").trim();
    return `${shortCourse} ${t}`;
  }

  return `${c} · ${t}`;
}

export function physicalTextbookInventoryLabel(
  course: string,
  text: string,
  subject: string
): string {
  return `${physicalTextbookLabel(course, text)}（${subject}）`;
}

export function inventoryLabelFromCombined(
  combined: string,
  subject: string
): string | null {
  if (subject === "ロボット") {
    const parsed = parseRobotNextTextParts(combined);
    if (parsed?.course && parsed?.text) {
      return physicalTextbookInventoryLabel(
        parsed.course,
        parsed.text,
        subject
      );
    }
  }
  if (subject === "プログラミング") {
    const parsed = parseProgrammingNextTextParts(combined);
    if (parsed?.course && parsed?.text) {
      return physicalTextbookInventoryLabel(
        parsed.course,
        parsed.text,
        subject
      );
    }
  }
  return null;
}
