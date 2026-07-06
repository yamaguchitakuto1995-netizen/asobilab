/**
 * 次回テキストの保存形式:
 * - 通常（2周でない大枠）: 「大枠 / 単元」 例: プレプライマリー / 1-1
 * - ロボットの（2周）コース: 「大枠 / 1周目|2周目 / 単元」 例: ベーシック（2周） / 1周目 / 1-1
 *   ※進級時 SU ありのコースは SU を 1周目の先頭にだけ含め、2周目は 1-1 から
 *
 * 仕様変更時は `npm run gen:next-text-sql` で schema / patches を再生成すること。
 */

const SEP = " / ";

function pair(tier: string, unit: string): string {
  return `${tier}${SEP}${unit}`;
}

/** 大枠 / 周 / 単元（ロボット（2周）用） */
function triple(tier: string, lap: string, unit: string): string {
  return `${tier}${SEP}${lap}${SEP}${unit}`;
}

/** 各テキスト n の 1-1, 1-2, … 12-1, 12-2 */
function standard12Pairs(): string[] {
  const out: string[] = [];
  for (let n = 1; n <= 12; n++) {
    out.push(`${n}-1`, `${n}-2`);
  }
  return out;
}

function expandTier(tier: string, units: string[]): string[] {
  return units.map((u) => pair(tier, u));
}

function expandTierLap(tier: string, lap: string, units: string[]): string[] {
  return units.map((u) => triple(tier, lap, u));
}

const LAP1 = "1周目";
const LAP2 = "2周目";

/** 標準12テキスト×2周（SU なし） */
function expandTwoLapStdOnly(tier: string, std: string[]): string[] {
  return [
    ...expandTierLap(tier, LAP1, std),
    ...expandTierLap(tier, LAP2, std),
  ];
}

/** 1周目: SU1,SU2 + std、2周目: std のみ */
function expandTwoLapSuThenStd(tier: string, std: string[]): string[] {
  return [
    ...expandTierLap(tier, LAP1, ["SU1", "SU2", ...std]),
    ...expandTierLap(tier, LAP2, std),
  ];
}

/** 1周目: SU1,SU2 + 標準12単元、2周目: 標準12単元のみ（アドバンス） */
function expandTwoLapSuThenAdv(
  tier: string,
  advUnits: readonly string[]
): string[] {
  const u = [...advUnits];
  return [
    ...expandTierLap(tier, LAP1, ["SU1", "SU2", ...u]),
    ...expandTierLap(tier, LAP2, u),
  ];
}

/** ロボット・プログラミング共通：新規入会2回（2段のまま） */
const TIER_STARTUP = "スタートアップ（入会時）";

// ----- ロボット -----

const R_PREP = "プレプライマリー";
const R_PRIM = "プライマリー";
const R_BASIC = "ベーシック（2周）";
const R_MIDDLE = "ミドル（2周）";
const R_ADV = "アドバンス（2周）";

/** アドバンスも他コース同様 各月 1-1, 1-2 … 12-1, 12-2 */
const R_ADV_UNITS = standard12Pairs();

function buildRobotFlat(): string[] {
  const std = standard12Pairs();
  return [
    ...expandTier(TIER_STARTUP, ["SU1", "SU2"]),
    ...expandTier(R_PREP, std),
    ...expandTier(R_PRIM, std),
    ...expandTwoLapStdOnly(R_BASIC, std),
    ...expandTwoLapSuThenStd(R_MIDDLE, std),
    ...expandTwoLapSuThenAdv(R_ADV, R_ADV_UNITS),
  ];
}

export const ROBOT_NEXT_TEXT_OPTIONS: readonly string[] =
  Object.freeze(buildRobotFlat());

const ROBOT_SET = new Set(ROBOT_NEXT_TEXT_OPTIONS);

export type RobotNextText = (typeof ROBOT_NEXT_TEXT_OPTIONS)[number];

export function isRobotNextText(s: string): s is RobotNextText {
  return ROBOT_SET.has(s);
}

const TWO_LAP_ROBOT_COURSES = new Set<string>([R_BASIC, R_MIDDLE, R_ADV]);

export { TWO_LAP_ROBOT_COURSES };

/**
 * DB・フォーム用に「コース」と「テキスト名」を分けて扱う。
 * - 2段（大枠 / 単元）: テキスト名は単元のみ（例: 1-1）
 * - ロボット（2周）3段: テキスト名は「1周目 / 1-1」形式（周と単元を1フィールドにまとめる）
 */
export function parseRobotNextTextParts(
  combined: string | null | undefined
): { course: string; text: string } | null {
  if (combined == null) return null;
  const s = String(combined).trim();
  if (!s) return null;
  const parts = s.split(SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) return { course: parts[0], text: parts[1] };
  if (parts.length === 3)
    return { course: parts[0], text: `${parts[1]}${SEP}${parts[2]}` };
  return null;
}

export function buildRobotNextTextFromParts(course: string, text: string): string {
  const c = course.trim();
  const t = text.trim();
  if (!c || !t) return "";
  if (TWO_LAP_ROBOT_COURSES.has(c)) {
    const segs = t.split(SEP).map((x) => x.trim()).filter(Boolean);
    if (segs.length >= 2) return triple(c, segs[0], segs[1]);
  }
  return pair(c, t);
}

export function robotCourseOptionsInOrder(): readonly string[] {
  return [TIER_STARTUP, R_PREP, R_PRIM, R_BASIC, R_MIDDLE, R_ADV];
}

export type NextTextChoice = { value: string; label: string };

export function robotTextChoicesForCourse(course: string): NextTextChoice[] {
  const out: NextTextChoice[] = [];
  for (const full of ROBOT_NEXT_TEXT_OPTIONS) {
    const p = parseRobotNextTextParts(full);
    if (p && p.course === course) {
      out.push({ value: p.text, label: p.text });
    }
  }
  return out;
}

export type NextTextOptgroup = { label: string; options: readonly string[] };

/** コース用プルダウン（保存値は value。ラベルはカリキュラムの並びに合わせた表示） */
export function robotCourseSelectOptions(): { value: string; label: string }[] {
  return [
    { value: TIER_STARTUP, label: `${TIER_STARTUP}（全コース共通・初回2回）` },
    { value: R_PREP, label: `① ${R_PREP}` },
    { value: R_PRIM, label: `② ${R_PRIM}` },
    { value: R_BASIC, label: `③ ${R_BASIC}` },
    { value: R_MIDDLE, label: `④ ${R_MIDDLE}` },
    { value: R_ADV, label: `⑤ ${R_ADV}` },
  ];
}

/**
 * 選択中コースに応じたテキスト名プルダウン用。
 * （2周）コースは 1周目／2周目で optgroup を分ける。
 */
export function robotTextOptgroupsForCourse(course: string): NextTextOptgroup[] {
  const c = course.trim();
  if (!c) return [];
  if (!TWO_LAP_ROBOT_COURSES.has(c)) {
    const choices = robotTextChoicesForCourse(c);
    if (!choices.length) return [];
    return [{ label: "テキスト名を選択", options: choices.map((x) => x.value) }];
  }
  const lapOrder = [LAP1, LAP2] as const;
  const byLap = new Map<string, string[]>();
  for (const lap of lapOrder) byLap.set(lap, []);
  for (const full of ROBOT_NEXT_TEXT_OPTIONS) {
    const p = parseRobotNextTextParts(full);
    if (!p || p.course !== c) continue;
    const inner = p.text.split(SEP).map((x) => x.trim()).filter(Boolean);
    const lap = inner[0];
    if (!lap || !byLap.has(lap)) continue;
    byLap.get(lap)!.push(p.text);
  }
  const groups: NextTextOptgroup[] = [];
  for (const lap of lapOrder) {
    const opts = byLap.get(lap) ?? [];
    if (opts.length) {
      groups.push({ label: `${lap}のテキスト名`, options: opts });
    }
  }
  return groups;
}

export function parseProgrammingNextTextParts(
  combined: string | null | undefined
): { course: string; text: string } | null {
  if (combined == null) return null;
  const s = String(combined).trim();
  if (!s) return null;
  const parts = s.split(SEP).map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  return { course: parts[0], text: parts[1] };
}

export function buildProgrammingNextTextFromParts(
  course: string,
  text: string
): string {
  return pair(course.trim(), text.trim());
}

export function resolveRobotNextTextPartsForStudent(student: {
  next_text_robot?: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
}): { course: string; text: string; full: string | null } | null {
  const co = student.next_text_robot_course?.trim() || "";
  const te = student.next_text_robot_text?.trim() || "";
  const fullRaw = student.next_text_robot?.trim() || "";
  if (co && te) {
    const built = buildRobotNextTextFromParts(co, te);
    const candidate = fullRaw || built;
    const full =
      candidate && isRobotNextText(candidate) ? candidate : null;
    return { course: co, text: te, full };
  }
  const parsed = parseRobotNextTextParts(fullRaw || null);
  if (!parsed) return null;
  const built = buildRobotNextTextFromParts(parsed.course, parsed.text);
  const candidate = fullRaw || built;
  const full =
    candidate && isRobotNextText(candidate) ? candidate : null;
  return { course: parsed.course, text: parsed.text, full };
}

export function robotNextTextOptgroups(): NextTextOptgroup[] {
  const std = standard12Pairs();
  return [
    {
      label: `${TIER_STARTUP}（全コース共通・初回2回）`,
      options: expandTier(TIER_STARTUP, ["SU1", "SU2"]),
    },
    { label: `① ${R_PREP}`, options: expandTier(R_PREP, std) },
    { label: `② ${R_PRIM}`, options: expandTier(R_PRIM, std) },
    {
      label: `③ ${R_BASIC} — ${LAP1}`,
      options: expandTierLap(R_BASIC, LAP1, std),
    },
    {
      label: `③ ${R_BASIC} — ${LAP2}（12-2 後・再び 1-1 から）`,
      options: expandTierLap(R_BASIC, LAP2, std),
    },
    {
      label: `④ ${R_MIDDLE} — ${LAP1}（進級時 SU あり）`,
      options: expandTierLap(R_MIDDLE, LAP1, ["SU1", "SU2", ...std]),
    },
    {
      label: `④ ${R_MIDDLE} — ${LAP2}`,
      options: expandTierLap(R_MIDDLE, LAP2, std),
    },
    {
      label: `⑤ ${R_ADV} — ${LAP1}（進級時 SU あり）`,
      options: expandTierLap(R_ADV, LAP1, ["SU1", "SU2", ...R_ADV_UNITS]),
    },
    {
      label: `⑤ ${R_ADV} — ${LAP2}`,
      options: expandTierLap(R_ADV, LAP2, [...R_ADV_UNITS]),
    },
  ];
}

// ----- プログラミング -----

const P_BAS = "ベーシック";
const P_BAS2 = "ベーシック2";
const P_MID = "ミドル";
const P_MID2 = "ミドル2";
const P_ADV = "アドバンス";

export function programmingCourseOptionsInOrder(): readonly string[] {
  return [TIER_STARTUP, P_BAS, P_BAS2, P_MID, P_MID2, P_ADV];
}

function buildProgrammingFlat(): string[] {
  const std = standard12Pairs();
  return [
    ...expandTier(TIER_STARTUP, ["SU1", "SU2"]),
    ...expandTier(P_BAS, std),
    ...expandTier(P_BAS2, ["SU1", "SU2", ...std]),
    ...expandTier(P_MID, std),
    ...expandTier(P_MID2, ["SU1", "SU2", ...std]),
    ...expandTier(P_ADV, ["SU1", "SU2", ...std]),
  ];
}

export const PROGRAMMING_NEXT_TEXT_OPTIONS: readonly string[] =
  Object.freeze(buildProgrammingFlat());

const PROGRAMMING_SET = new Set(PROGRAMMING_NEXT_TEXT_OPTIONS);

export type ProgrammingNextText = (typeof PROGRAMMING_NEXT_TEXT_OPTIONS)[number];

export function isProgrammingNextText(s: string): s is ProgrammingNextText {
  return PROGRAMMING_SET.has(s);
}

export function programmingTextChoicesForCourse(
  course: string
): NextTextChoice[] {
  const out: NextTextChoice[] = [];
  for (const full of PROGRAMMING_NEXT_TEXT_OPTIONS) {
    const p = parseProgrammingNextTextParts(full);
    if (p && p.course === course) {
      out.push({ value: p.text, label: p.text });
    }
  }
  return out;
}

export function programmingCourseSelectOptions(): {
  value: string;
  label: string;
}[] {
  return [
    { value: TIER_STARTUP, label: `${TIER_STARTUP}（全コース共通・初回2回）` },
    { value: P_BAS, label: `① ${P_BAS}` },
    {
      value: P_BAS2,
      label: `② ${P_BAS2}（ベーシックから進級時 SU あり）`,
    },
    { value: P_MID, label: `③ ${P_MID}` },
    {
      value: P_MID2,
      label: `④ ${P_MID2}（ミドルから進級時 SU あり）`,
    },
    {
      value: P_ADV,
      label: `⑤ ${P_ADV}（ミドル2から進級時 SU あり）`,
    },
  ];
}

/** プログラミング・テキスト名プルダウン（単一 optgroup） */
export function programmingTextOptgroupsForCourse(
  course: string
): NextTextOptgroup[] {
  const choices = programmingTextChoicesForCourse(course.trim());
  if (!choices.length) return [];
  return [{ label: "テキスト名を選択", options: choices.map((x) => x.value) }];
}

export function resolveProgrammingNextTextPartsForStudent(student: {
  next_text_programming?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
}): { course: string; text: string; full: string | null } | null {
  const co = student.next_text_programming_course?.trim() || "";
  const te = student.next_text_programming_text?.trim() || "";
  const fullRaw = student.next_text_programming?.trim() || "";
  if (co && te) {
    const built = buildProgrammingNextTextFromParts(co, te);
    const candidate = fullRaw || built;
    const full =
      candidate && isProgrammingNextText(candidate) ? candidate : null;
    return { course: co, text: te, full };
  }
  const parsed = parseProgrammingNextTextParts(fullRaw || null);
  if (!parsed) return null;
  const built = buildProgrammingNextTextFromParts(parsed.course, parsed.text);
  const candidate = fullRaw || built;
  const full =
    candidate && isProgrammingNextText(candidate) ? candidate : null;
  return { course: parsed.course, text: parsed.text, full };
}

function nextCourseInCurriculumOrder(
  currentCourse: string,
  order: readonly string[]
): string | null {
  const idx = order.indexOf(currentCourse);
  if (idx === -1 || idx >= order.length - 1) return null;
  return order[idx + 1] ?? null;
}

/** 現コースの次コースの先頭テキスト（進級時のジャンプ先） */
export function firstCombinedTextOfNextCourse(
  subject: "ロボット" | "プログラミング",
  student: {
    next_text_robot?: string | null;
    next_text_robot_course?: string | null;
    next_text_robot_text?: string | null;
    next_text_programming?: string | null;
    next_text_programming_course?: string | null;
    next_text_programming_text?: string | null;
  }
): string | null {
  if (subject === "ロボット") {
    const parts = resolveRobotNextTextPartsForStudent(student);
    if (!parts?.course) return null;
    const nextCourse = nextCourseInCurriculumOrder(
      parts.course,
      robotCourseOptionsInOrder()
    );
    if (!nextCourse) return null;
    return (
      ROBOT_NEXT_TEXT_OPTIONS.find((opt) => {
        const p = parseRobotNextTextParts(opt);
        return p?.course === nextCourse;
      }) ?? null
    );
  }

  const parts = resolveProgrammingNextTextPartsForStudent(student);
  if (!parts?.course) return null;
  const nextCourse = nextCourseInCurriculumOrder(
    parts.course,
    programmingCourseOptionsInOrder()
  );
  if (!nextCourse) return null;
  return (
    PROGRAMMING_NEXT_TEXT_OPTIONS.find((opt) => {
      const p = parseProgrammingNextTextParts(opt);
      return p?.course === nextCourse;
    }) ?? null
  );
}

/** 次回テキスト更新でコースが変わったか */
export function didCrossCourseBoundary(
  subject: "ロボット" | "プログラミング",
  previousFull: string | null | undefined,
  nextFull: string | null | undefined
): boolean {
  if (!previousFull?.trim() || !nextFull?.trim()) return false;
  if (subject === "ロボット") {
    const prev = parseRobotNextTextParts(previousFull);
    const next = parseRobotNextTextParts(nextFull);
    return Boolean(prev?.course && next?.course && prev.course !== next.course);
  }
  const prev = parseProgrammingNextTextParts(previousFull);
  const next = parseProgrammingNextTextParts(nextFull);
  return Boolean(prev?.course && next?.course && prev.course !== next.course);
}

/**
 * カリキュラム順の「次の」正規テキスト。
 * 末尾にいる場合は現在値のまま（上書きスキップ用に同一参照で返す）。
 * 未設定・不正なら null。
 */
export function advanceRobotNextTextCombined(
  current: string | null | undefined
): string | null {
  if (current == null) return null;
  const s = String(current).trim();
  if (!s || !isRobotNextText(s)) return null;
  const idx = ROBOT_NEXT_TEXT_OPTIONS.indexOf(s as RobotNextText);
  if (idx < 0) return null;
  if (idx >= ROBOT_NEXT_TEXT_OPTIONS.length - 1) return s;
  return ROBOT_NEXT_TEXT_OPTIONS[idx + 1]!;
}

/**
 * `students` 更新用。分割列と結合列を揃える。
 */
export function robotNextTextStudentColumnsFromCombined(combined: string | null): {
  next_text_robot: string | null;
  next_text_robot_course: string | null;
  next_text_robot_text: string | null;
} {
  const c = combined?.trim() || "";
  if (!c) {
    return {
      next_text_robot: null,
      next_text_robot_course: null,
      next_text_robot_text: null,
    };
  }
  const p = parseRobotNextTextParts(c);
  return {
    next_text_robot: c,
    next_text_robot_course: p?.course ?? null,
    next_text_robot_text: p?.text ?? null,
  };
}

export function advanceProgrammingNextTextCombined(
  current: string | null | undefined
): string | null {
  if (current == null) return null;
  const s = String(current).trim();
  if (!s || !isProgrammingNextText(s)) return null;
  const idx = PROGRAMMING_NEXT_TEXT_OPTIONS.indexOf(s as ProgrammingNextText);
  if (idx < 0) return null;
  if (idx >= PROGRAMMING_NEXT_TEXT_OPTIONS.length - 1) return s;
  return PROGRAMMING_NEXT_TEXT_OPTIONS[idx + 1]!;
}

export function programmingNextTextStudentColumnsFromCombined(
  combined: string | null
): {
  next_text_programming: string | null;
  next_text_programming_course: string | null;
  next_text_programming_text: string | null;
} {
  const c = combined?.trim() || "";
  if (!c) {
    return {
      next_text_programming: null,
      next_text_programming_course: null,
      next_text_programming_text: null,
    };
  }
  const p = parseProgrammingNextTextParts(c);
  return {
    next_text_programming: c,
    next_text_programming_course: p?.course ?? null,
    next_text_programming_text: p?.text ?? null,
  };
}

export function programmingNextTextOptgroups(): NextTextOptgroup[] {
  const std = standard12Pairs();
  return [
    {
      label: `${TIER_STARTUP}（全コース共通・初回2回）`,
      options: expandTier(TIER_STARTUP, ["SU1", "SU2"]),
    },
    { label: `① ${P_BAS}`, options: expandTier(P_BAS, std) },
    {
      label: `② ${P_BAS2}（ベーシックから進級時 SU あり）`,
      options: expandTier(P_BAS2, ["SU1", "SU2", ...std]),
    },
    { label: `③ ${P_MID}`, options: expandTier(P_MID, std) },
    {
      label: `④ ${P_MID2}（ミドルから進級時 SU あり）`,
      options: expandTier(P_MID2, ["SU1", "SU2", ...std]),
    },
    {
      label: `⑤ ${P_ADV}（ミドル2から進級時 SU あり）`,
      options: expandTier(P_ADV, ["SU1", "SU2", ...std]),
    },
  ];
}

/** SQL シングルクォート用エスケープ */
export function sqlQuoteLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
