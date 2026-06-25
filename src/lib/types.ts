export const GRADE_LEVELS = [
  "年少",
  "年中",
  "年長",
  "小1",
  "小2",
  "小3",
  "小4",
  "小5",
  "小6",
  "中1",
  "中2",
  "中3",
  "高1",
  "高2",
  "高3",
  "浪人",
  "その他",
] as const;

export type GradeLevel = (typeof GRADE_LEVELS)[number];

export const ATTENDANCE_OPTIONS = [
  { value: "present", label: "出席" },
  { value: "absent", label: "欠席" },
  { value: "late", label: "遅刻" },
  { value: "makeup", label: "振替" },
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_OPTIONS)[number]["value"];

/** 予定モードでは 遅刻 を選択肢から除外 */
export const SCHEDULED_ATTENDANCE_OPTIONS = [
  { value: "present", label: "出席予定" },
  { value: "absent", label: "欠席予定" },
  { value: "makeup", label: "振替予定" },
] as const;

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "出席",
  absent: "欠席",
  late: "遅刻",
  makeup: "振替",
};

export const SCHEDULED_ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "出席予定",
  absent: "欠席予定",
  late: "—",
  makeup: "振替予定",
};

export const ATTENDANCE_BADGE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  absent: "bg-rose-100 text-rose-800 ring-rose-600/20",
  late: "bg-amber-100 text-amber-800 ring-amber-600/20",
  makeup: "bg-sky-100 text-sky-800 ring-sky-600/20",
};

/** 受講教科 (講座) の選択肢。塾の取り扱い教科を増やすときはここを編集 */
export const COURSE_SUBJECTS = ["プログラミング", "ロボット"] as const;
export type CourseSubject = (typeof COURSE_SUBJECTS)[number];

/** DB の classrooms 行 */
export type ClassroomRecord = {
  id: string;
  name: string;
  subjects: CourseSubject[];
  note: string | null;
  sort_order: number;
  /** 新規振替枠の初期定員（1コマあたりの合計上限） */
  default_max_students: number;
};

/** @deprecated 教室一覧は DB の classrooms テーブルから fetchClassrooms で取得 */
export const LEGACY_SEED_CLASSROOMS = [
  { name: "長浜八幡中山教室", subjects: ["ロボット"] as const },
  { name: "長浜駅前通り教室", subjects: ["ロボット", "プログラミング"] as const },
  { name: "米原駅前教室", subjects: ["ロボット", "プログラミング"] as const },
  { name: "米原長岡教室", subjects: ["ロボット", "プログラミング"] as const },
  { name: "西宮鳴尾町教室", subjects: ["ロボット", "プログラミング"] as const },
  { name: "出屋敷教室", subjects: ["ロボット", "プログラミング"] as const },
  { name: "長浜神照教室", subjects: ["プログラミング"] as const },
  {
    name: "学校法人芦屋学園芦屋大学附属幼稚園教室",
    subjects: ["ロボット"] as const,
  },
] as const satisfies ReadonlyArray<{
  name: string;
  subjects: ReadonlyArray<CourseSubject>;
}>;

export type ClassroomName = string;

/** 教室名から開講教科（classrooms 一覧を渡す） */
export function classroomSubjects(
  name: string | null | undefined,
  classrooms: readonly Pick<ClassroomRecord, "name" | "subjects">[]
): readonly CourseSubject[] {
  if (!name) return COURSE_SUBJECTS;
  const found = classrooms.find((c) => c.name === name);
  return found ? (found.subjects as readonly CourseSubject[]) : COURSE_SUBJECTS;
}

/** @deprecated fetchClassrooms の結果を使ってください */
export const CLASSROOMS = LEGACY_SEED_CLASSROOMS;
/** @deprecated classroomNames(classrooms) を使ってください */
export const CLASSROOM_NAMES: readonly string[] = LEGACY_SEED_CLASSROOMS.map(
  (c) => c.name
);

/** 教室の表示色 (一覧やバッジで使用) */
export function classroomBadgeClass(name: string | null | undefined): string {
  if (!name) return "bg-slate-50 text-slate-500 ring-slate-200";
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const palette = [
    "bg-blue-50 text-blue-800 ring-blue-200",
    "bg-purple-50 text-purple-800 ring-purple-200",
    "bg-pink-50 text-pink-800 ring-pink-200",
    "bg-emerald-50 text-emerald-800 ring-emerald-200",
    "bg-amber-50 text-amber-800 ring-amber-200",
    "bg-cyan-50 text-cyan-800 ring-cyan-200",
    "bg-rose-50 text-rose-800 ring-rose-200",
    "bg-indigo-50 text-indigo-800 ring-indigo-200",
  ];
  return palette[h % palette.length];
}

/** 授業のステータス */
export const LESSON_STATUS_OPTIONS = [
  { value: "recorded", label: "記録済み" },
  { value: "scheduled", label: "予定" },
] as const;
export type LessonStatus = (typeof LESSON_STATUS_OPTIONS)[number]["value"];

/** コマ (時限) の上限。塾の時間割に合わせて増減可。 */
export const MAX_PERIOD = 10;
export const PERIOD_OPTIONS = Array.from(
  { length: MAX_PERIOD },
  (_, i) => i + 1
);
export function periodLabel(p: number | null | undefined): string {
  return p ? `${p}コマ目` : "コマ未設定";
}

/**
 * 保護者振替：振替先に選べる上限日数（今日から何日先まで）。
 * `book_makeup_lesson` の検証と揃えること（`supabase/schema.sql`）。
 */
export const MAKEUP_TARGET_MAX_DAYS_AHEAD = 120;

/** 月内の「第◯◯週」(その曜日が月に何回目か)。1〜5 */
export const WEEK_ORDINAL_OPTIONS = [
  { value: 1, label: "第1週" },
  { value: 2, label: "第2週" },
  { value: 3, label: "第3週" },
  { value: 4, label: "第4週" },
  { value: 5, label: "第5週" },
] as const;

/** 例: [2,4] → 「第2・4週」 */
export function formatWeekOrdinals(ords: number[] | null | undefined): string {
  if (!ords?.length) return "—";
  const sorted = [...new Set(ords)].sort((a, b) => a - b);
  return sorted.map((n) => `第${n}週`).join("・");
}

export type Student = {
  id: string;
  name: string;
  name_kana?: string | null;
  grade: GradeLevel;
  classroom: string | null;
  subjects: string[];
  /** ロボット受講時のみ。教材リストから選択（`courseNextText.ts`） */
  next_text_robot: string | null;
  /** ロボット「コース名」列（プレプライマリー等）。表示・検索用 */
  next_text_robot_course?: string | null;
  /** ロボット「テキスト名」列（1-1 または 2周では「1周目 / 1-1」） */
  next_text_robot_text?: string | null;
  /** プログラミング受講時のみ。同上 */
  next_text_programming: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
  /** ロボットのレギュラー出席コマ（lesson_capacities.id）。コマ時刻と連動して出席予定を自動生成 */
  enrollment_robot_capacity_id?: string | null;
  /** プログラミングのレギュラー出席コマ（lesson_capacities.id） */
  enrollment_prog_capacity_id?: string | null;
  /** 兄弟姉妹グループ（同一 UUID の生徒が兄弟として扱われる） */
  sibling_group_id?: string | null;
  note: string | null;
  created_at: string;
  created_by: string;
};

export type Lesson = {
  id: string;
  student_id: string;
  teacher_id: string;
  lesson_date: string;
  period: number | null;
  attendance: AttendanceStatus;
  subject: string | null;
  textbook: string | null;
  status: LessonStatus;
  text_memo: string | null;
  /** 実施会場。未指定または undefined のときは生徒の所属教室で開催したものとして扱う */
  lesson_classroom?: string | null;
  /** 振替で埋めた場合: 欠席する元の授業日 */
  source_lesson_date: string | null;
  source_period: number | null;
  source_subject: string | null;
  /** 生徒登録フローで自動作成した出席予定のとき true */
  created_from_enrollment?: boolean;
  created_at: string;
  updated_at: string;
};

/** 授業行の実施会場（未指定なら生徒の所属教室） */
export function effectiveLessonClassroom(
  lesson: { lesson_classroom?: string | null },
  studentClassroom: string | null
): string | null {
  return lesson.lesson_classroom ?? studentClassroom ?? null;
}

/** 1コマ分の振替枠設定 (lesson_capacities テーブルの行) */
export type LessonCapacity = {
  id: string;
  classroom: string;
  day_of_week: number;
  /** 開催週 (1=第1週 …)。例: 第2・第4日曜 = [2,4] */
  week_ordinals: number[];
  period: number;
  subject: string;
  max_students: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/** 教室・開催日（暦日）・コマ（・任意で教科）ごとの時刻。subject が null なら全教科共通。 */
export type ClassroomPeriodTime = {
  id: string;
  classroom: string;
  /** YYYY-MM-DD（そのコマが実際に開催される日） */
  lesson_date: string;
  period: number;
  /** null = その枠の教科共通の時刻 */
  subject: string | null;
  start_time: string;
  end_time: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * get_makeup_availability(date) RPC の戻り行。
 * 指定日付の各枠について「最大」「現在の予定数」「空き」を返す。
 */
export type SlotAvailability = {
  classroom: string;
  period: number;
  subject: string;
  max_students: number;
  occupied: number;
  available: number;
};
