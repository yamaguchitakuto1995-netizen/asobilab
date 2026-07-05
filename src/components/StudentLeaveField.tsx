import { Field, inputClass } from "@/components/Field";

type Props = {
  defaultLeaveFromYm?: string | null;
  defaultLeaveUntilYm?: string | null;
};

export function StudentLeaveField({
  defaultLeaveFromYm = "",
  defaultLeaveUntilYm = "",
}: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">休会設定</h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          休会期間中の授業コマは自動で「休会中」になります。休会明けの月は、その月のテキスト（例: 9月→9-1）から再開します。
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field
          label="休会開始月"
          htmlFor="leave_from_ym"
          hint="空欄のときは終了月のみ指定で、今月から休会"
        >
          <input
            id="leave_from_ym"
            name="leave_from_ym"
            type="month"
            defaultValue={defaultLeaveFromYm ?? ""}
            className={inputClass}
          />
        </Field>
        <Field
          label="何月まで休会"
          htmlFor="leave_until_ym"
          hint="この月まで休会（例: 7〜8月休会なら 2026-08）"
        >
          <input
            id="leave_until_ym"
            name="leave_until_ym"
            type="month"
            defaultValue={defaultLeaveUntilYm ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}
