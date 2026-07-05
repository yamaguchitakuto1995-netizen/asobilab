import { Field, inputClass } from "@/components/Field";

type Props = {
  defaultCourseStartRobotYm?: string | null;
  defaultCourseStartProgrammingYm?: string | null;
};

/** 現コースの開始月（入会時に登録。進級時は自動更新） */
export function StudentCourseStartField({
  defaultCourseStartRobotYm = "",
  defaultCourseStartProgrammingYm = "",
}: Props) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-emerald-950">コース開始月</h3>
        <p className="text-xs text-emerald-900/80 mt-1 leading-relaxed">
          入会時（または現コース開始時）の年月を登録してください。ここを基準に「○年○月から□□へ自動進級」が算出されます。進級後は自動で更新されます。
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="ロボット・コース開始月"
          htmlFor="course_start_robot_ym"
          hint="ロボット受講時は必須"
        >
          <input
            id="course_start_robot_ym"
            name="course_start_robot_ym"
            type="month"
            defaultValue={defaultCourseStartRobotYm ?? ""}
            className={inputClass}
          />
        </Field>
        <Field
          label="プログラミング・コース開始月"
          htmlFor="course_start_programming_ym"
          hint="プログラミング受講時は必須"
        >
          <input
            id="course_start_programming_ym"
            name="course_start_programming_ym"
            type="month"
            defaultValue={defaultCourseStartProgrammingYm ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}
