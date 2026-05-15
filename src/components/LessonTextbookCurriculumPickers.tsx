"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import {
  buildProgrammingNextTextFromParts,
  buildRobotNextTextFromParts,
  isProgrammingNextText,
  isRobotNextText,
  parseProgrammingNextTextParts,
  parseRobotNextTextParts,
  programmingCourseSelectOptions,
  programmingTextOptgroupsForCourse,
  robotCourseSelectOptions,
  robotTextOptgroupsForCourse,
} from "@/lib/courseNextText";

const selectPullDownClass = `${inputClass} cursor-pointer`;
const lessonCurriculumSelectClass = `${selectPullDownClass} min-h-[3rem] border-2 border-slate-500 bg-white text-slate-900`;

type Props = {
  /** 現在の科目（プルダウンは ロボット / プログラミング のときだけ） */
  subject: string;
  /** マウント時に使用テキストからコース／テキストを復元する用 */
  initialTextbook: string;
  /** カリキュラムで選んだ結合文字列（例: プレプライマリー / 1-1）を親へ渡す */
  onPickCurriculum: (combined: string) => void;
};

export function RobotLessonPickers({
  initialTextbook,
  onPick,
}: {
  initialTextbook: string;
  onPick: (s: string) => void;
}) {
  const [course, setCourse] = useState(
    () => parseRobotNextTextParts(initialTextbook)?.course ?? ""
  );
  const [text, setText] = useState(
    () => parseRobotNextTextParts(initialTextbook)?.text ?? ""
  );

  const courseRows = useMemo(() => robotCourseSelectOptions(), []);
  const textOptgroups = useMemo(
    () => (course ? robotTextOptgroupsForCourse(course) : []),
    [course]
  );
  const flatTextValues = useMemo(
    () => textOptgroups.flatMap((g) => [...g.options]),
    [textOptgroups]
  );

  useEffect(() => {
    if (!text) return;
    if (!course) {
      setText("");
      return;
    }
    if (!flatTextValues.includes(text)) setText("");
  }, [course, flatTextValues, text]);

  useEffect(() => {
    if (!course || !text) return;
    const combined = buildRobotNextTextFromParts(course, text);
    if (isRobotNextText(combined)) onPick(combined);
  }, [course, text, onPick]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
      <p className="text-xs font-medium text-slate-700">
        カリキュラムから選ぶ（「使用テキスト」欄に反映されます）
      </p>
      <Field
        label="ロボット・コース"
        htmlFor="lesson_curriculum_robot_course"
        hint="リストから選択してください。"
      >
        <select
          id="lesson_curriculum_robot_course"
          className={lessonCurriculumSelectClass}
          value={course}
          onChange={(e) => {
            const v = e.target.value;
            setCourse(v);
            if (!v) setText("");
          }}
        >
          <option value="">未選択</option>
          {courseRows.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="ロボット・テキスト名"
        htmlFor="lesson_curriculum_robot_text"
        hint="コースを選んでから一覧で選びます。"
      >
        <select
          id="lesson_curriculum_robot_text"
          className={lessonCurriculumSelectClass}
          value={text}
          disabled={!course}
          onChange={(e) => setText(e.target.value)}
        >
          <option value="">
            {course ? "未選択" : "先にコースを選んでください"}
          </option>
          {textOptgroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function ProgLessonPickers({
  initialTextbook,
  onPick,
}: {
  initialTextbook: string;
  onPick: (s: string) => void;
}) {
  const [course, setCourse] = useState(
    () => parseProgrammingNextTextParts(initialTextbook)?.course ?? ""
  );
  const [text, setText] = useState(
    () => parseProgrammingNextTextParts(initialTextbook)?.text ?? ""
  );

  const courseRows = useMemo(() => programmingCourseSelectOptions(), []);
  const textOptgroups = useMemo(
    () => (course ? programmingTextOptgroupsForCourse(course) : []),
    [course]
  );
  const flatTextValues = useMemo(
    () => textOptgroups.flatMap((g) => [...g.options]),
    [textOptgroups]
  );

  useEffect(() => {
    if (!text) return;
    if (!course) {
      setText("");
      return;
    }
    if (!flatTextValues.includes(text)) setText("");
  }, [course, flatTextValues, text]);

  useEffect(() => {
    if (!course || !text) return;
    const combined = buildProgrammingNextTextFromParts(course, text);
    if (isProgrammingNextText(combined)) onPick(combined);
  }, [course, text, onPick]);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
      <p className="text-xs font-medium text-slate-700">
        カリキュラムから選ぶ（「使用テキスト」欄に反映されます）
      </p>
      <Field
        label="プログラミング・コース"
        htmlFor="lesson_curriculum_prog_course"
        hint="リストから選択してください。"
      >
        <select
          id="lesson_curriculum_prog_course"
          className={lessonCurriculumSelectClass}
          value={course}
          onChange={(e) => {
            const v = e.target.value;
            setCourse(v);
            if (!v) setText("");
          }}
        >
          <option value="">未選択</option>
          {courseRows.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="プログラミング・テキスト名"
        htmlFor="lesson_curriculum_prog_text"
        hint="コースを選んでから一覧で選びます。"
      >
        <select
          id="lesson_curriculum_prog_text"
          className={lessonCurriculumSelectClass}
          value={text}
          disabled={!course}
          onChange={(e) => setText(e.target.value)}
        >
          <option value="">
            {course ? "未選択" : "先にコースを選んでください"}
          </option>
          {textOptgroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
    </div>
  );
}

export function LessonTextbookCurriculumPickers({
  subject,
  initialTextbook,
  onPickCurriculum,
}: Props) {
  if (subject === "ロボット") {
    return (
      <RobotLessonPickers
        initialTextbook={initialTextbook}
        onPick={onPickCurriculum}
      />
    );
  }
  if (subject === "プログラミング") {
    return (
      <ProgLessonPickers
        initialTextbook={initialTextbook}
        onPick={onPickCurriculum}
      />
    );
  }
  return null;
}

/** 授業フォーム用：ロボット／プログラミングのカリキュラムを常に表示。選ぶと使用テキストと科目を更新。 */
export function LessonFormCurriculumSection({
  subjectStr,
  textbook,
  setTextbook,
  setSubjectStr,
}: {
  subjectStr: string;
  textbook: string;
  setTextbook: (v: string) => void;
  setSubjectStr: (v: string) => void;
}) {
  return (
    <div
      id="lesson-curriculum-pickers"
      className="space-y-4 rounded-xl border-[3px] border-brand-600 bg-brand-50/90 px-3 py-4 shadow-md scroll-mt-24"
      data-testid="lesson-curriculum-pickers"
    >
      <div>
        <p className="text-base font-bold text-slate-900">
          【ここです】カリキュラム：コースとテキスト名（授業の使用テキスト用）
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-800">
          このブロックは<strong>フォームの先頭付近</strong>にあります。ロボット／プログラミングの<strong>太い枠のプルダウン</strong>から選ぶと「使用テキスト」と「科目」が埋まります。
        </p>
        <p className="mt-2 text-[11px] leading-snug text-amber-900 bg-amber-100 border border-amber-300 rounded px-2 py-1.5">
          見えないときは<strong>スーパーリロード</strong>（⌘+Shift+R）か、最新版のデプロイ・開発サーバ再起動を確認してください。
        </p>
      </div>
      <RobotLessonPickers
        key={subjectStr === "ロボット" ? "lesson-robot-on" : "lesson-robot-off"}
        initialTextbook={subjectStr === "ロボット" ? textbook : ""}
        onPick={(s) => {
          setTextbook(s);
          setSubjectStr("ロボット");
        }}
      />
      <ProgLessonPickers
        key={
          subjectStr === "プログラミング" ? "lesson-prog-on" : "lesson-prog-off"
        }
        initialTextbook={subjectStr === "プログラミング" ? textbook : ""}
        onPick={(s) => {
          setTextbook(s);
          setSubjectStr("プログラミング");
        }}
      />
    </div>
  );
}
