"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import {
  parseProgrammingNextTextParts,
  parseRobotNextTextParts,
  programmingCourseSelectOptions,
  programmingTextOptgroupsForCourse,
  robotCourseSelectOptions,
  robotTextOptgroupsForCourse,
} from "@/lib/courseNextText";

const selectPullDownClass = `${inputClass} cursor-pointer`;
const nextTextSelectClass = `${selectPullDownClass} min-h-[3rem] border-2 border-slate-500 bg-white text-slate-900`;

function NextTextRobotSplitPickers({
  defaultCombined,
  defaultCourse,
  defaultText,
}: {
  defaultCombined: string | null;
  defaultCourse?: string | null;
  defaultText?: string | null;
}) {
  const initial = useMemo(() => {
    const co = defaultCourse?.trim() ?? "";
    const te = defaultText?.trim() ?? "";
    if (co && te) return { course: co, text: te };
    return parseRobotNextTextParts(defaultCombined) ?? { course: "", text: "" };
  }, [defaultCombined, defaultCourse, defaultText]);

  const [course, setCourse] = useState(initial.course);
  const [text, setText] = useState(initial.text);

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
    const ok = flatTextValues.includes(text);
    if (!ok) setText("");
  }, [course, flatTextValues, text]);

  return (
    <div className="space-y-3">
      <Field
        label="ロボット・次回テキスト（コース）"
        htmlFor="next_text_robot_course"
        hint="カリキュラムのコースから選択します。"
      >
        <select
          id="next_text_robot_course"
          name="next_text_robot_course"
          className={nextTextSelectClass}
          value={course}
          onChange={(e) => {
            const v = e.target.value;
            setCourse(v);
            if (!v) setText("");
          }}
        >
          <option value="">未設定</option>
          {courseRows.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="ロボット・次回テキスト（テキスト名）"
        htmlFor="next_text_robot_text"
        hint="コース選択後、リストから選びます。（2周）は 1周目・2周目でグループ分けされています。"
      >
        <select
          id="next_text_robot_text"
          name="next_text_robot_text"
          className={nextTextSelectClass}
          value={text}
          disabled={!course}
          onChange={(e) => setText(e.target.value)}
        >
          <option value="">
            {course ? "未設定" : "先にコースを選んでください"}
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

function NextTextProgrammingSplitPickers({
  defaultCombined,
  defaultCourse,
  defaultText,
}: {
  defaultCombined: string | null;
  defaultCourse?: string | null;
  defaultText?: string | null;
}) {
  const initial = useMemo(() => {
    const co = defaultCourse?.trim() ?? "";
    const te = defaultText?.trim() ?? "";
    if (co && te) return { course: co, text: te };
    return (
      parseProgrammingNextTextParts(defaultCombined) ?? { course: "", text: "" }
    );
  }, [defaultCombined, defaultCourse, defaultText]);

  const [course, setCourse] = useState(initial.course);
  const [text, setText] = useState(initial.text);

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
    const ok = flatTextValues.includes(text);
    if (!ok) setText("");
  }, [course, flatTextValues, text]);

  return (
    <div className="space-y-3">
      <Field
        label="プログラミング・次回テキスト（コース）"
        htmlFor="next_text_programming_course"
        hint="カリキュラムのコースから選択します。"
      >
        <select
          id="next_text_programming_course"
          name="next_text_programming_course"
          className={nextTextSelectClass}
          value={course}
          onChange={(e) => {
            const v = e.target.value;
            setCourse(v);
            if (!v) setText("");
          }}
        >
          <option value="">未設定</option>
          {courseRows.map((row) => (
            <option key={row.value} value={row.value}>
              {row.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="プログラミング・次回テキスト（テキスト名）"
        htmlFor="next_text_programming_text"
        hint="コース選択後、リストから選びます。"
      >
        <select
          id="next_text_programming_text"
          name="next_text_programming_text"
          className={nextTextSelectClass}
          value={text}
          disabled={!course}
          onChange={(e) => setText(e.target.value)}
        >
          <option value="">
            {course ? "未設定" : "先にコースを選んでください"}
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

export type StudentNextTextPickerDefaults = {
  defaultNextTextRobot?: string | null;
  defaultNextTextRobotCourse?: string | null;
  defaultNextTextRobotText?: string | null;
  defaultNextTextProgramming?: string | null;
  defaultNextTextProgrammingCourse?: string | null;
  defaultNextTextProgrammingText?: string | null;
};

/** 次回テキスト用プルダウン（クライアント）。枠・見出しは StudentNextTextFormSection がサーバーで出す。 */
export function StudentNextTextPickersPanel({
  defaultNextTextRobot = null,
  defaultNextTextRobotCourse = null,
  defaultNextTextRobotText = null,
  defaultNextTextProgramming = null,
  defaultNextTextProgrammingCourse = null,
  defaultNextTextProgrammingText = null,
}: StudentNextTextPickerDefaults) {
  return (
    <div className="space-y-6">
      <NextTextRobotSplitPickers
        defaultCombined={defaultNextTextRobot}
        defaultCourse={defaultNextTextRobotCourse}
        defaultText={defaultNextTextRobotText}
      />
      <NextTextProgrammingSplitPickers
        defaultCombined={defaultNextTextProgramming}
        defaultCourse={defaultNextTextProgrammingCourse}
        defaultText={defaultNextTextProgrammingText}
      />
    </div>
  );
}
