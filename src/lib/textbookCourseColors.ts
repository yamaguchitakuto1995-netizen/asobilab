/** 本日のテキスト「コース」チップの色（ロボット・プログラミング） */

export type TextbookCourseChipKey =
  | "robot-prep"
  | "robot-primary"
  | "robot-basic"
  | "robot-middle"
  | "robot-advance"
  | "robot-startup"
  | "prog-basic"
  | "prog-basic2"
  | "prog-middle"
  | "prog-middle2"
  | "prog-advance"
  | "prog-startup"
  | "default";

const CHIP_STYLES: Record<TextbookCourseChipKey, string> = {
  "robot-prep": "bg-pink-50 text-pink-500 ring-pink-200/90",
  "robot-primary": "bg-fuchsia-300 text-fuchsia-950 ring-fuchsia-700/40",
  "robot-basic": "bg-orange-100 text-orange-800 ring-orange-600/20",
  "robot-middle": "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  "robot-advance": "bg-violet-100 text-violet-800 ring-violet-600/20",
  "robot-startup": "bg-slate-100 text-slate-700 ring-slate-400/30",
  "prog-basic": "bg-yellow-100 text-yellow-900 ring-yellow-600/20",
  "prog-basic2": "bg-sky-100 text-sky-800 ring-sky-600/20",
  "prog-middle": "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  "prog-middle2": "bg-green-200 text-green-900 ring-green-700/30",
  "prog-advance": "bg-violet-100 text-violet-800 ring-violet-600/20",
  "prog-startup": "bg-slate-100 text-slate-700 ring-slate-400/30",
  default: "bg-slate-100 text-slate-700 ring-slate-400/30",
};

/** チップに表示する短いコース名 */
export function textbookCourseChipLabel(course: string): string {
  const c = course.trim();
  if (!c) return "—";
  return c
    .replace(/（2周）/g, "")
    .replace(/（入会時）/g, "")
    .replace(/（全コース共通・初回2回）/g, "")
    .trim();
}

export function resolveTextbookCourseChipKey(
  course: string,
  subject: string
): TextbookCourseChipKey {
  const c = course.trim();
  if (!c) return "default";

  if (subject === "ロボット") {
    if (c.includes("プレプライマリー")) return "robot-prep";
    if (c.includes("プライマリー")) return "robot-primary";
    if (c.includes("ベーシック")) return "robot-basic";
    if (c.includes("ミドル")) return "robot-middle";
    if (c.includes("アドバンス")) return "robot-advance";
    if (c.includes("スタートアップ")) return "robot-startup";
    return "default";
  }

  if (subject === "プログラミング") {
    if (c === "ベーシック2" || c.startsWith("ベーシック2")) return "prog-basic2";
    if (c.includes("ベーシック")) return "prog-basic";
    if (c === "ミドル2" || c.startsWith("ミドル2")) return "prog-middle2";
    if (c.includes("ミドル")) return "prog-middle";
    if (c.includes("アドバンス")) return "prog-advance";
    if (c.includes("スタートアップ")) return "prog-startup";
    return "default";
  }

  return "default";
}

export function textbookCourseChipClass(
  course: string,
  subject: string
): string {
  return CHIP_STYLES[resolveTextbookCourseChipKey(course, subject)];
}
