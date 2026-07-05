import { PROMOTION_TYPES, type PromotionType } from "@/lib/studentPromotion";

type Props = {
  defaultPromotionScheduledYm?: string | null;
  defaultPromotionType?: PromotionType | null;
};

export function StudentPromotionField({
  defaultPromotionScheduledYm,
  defaultPromotionType = "normal",
}: Props) {
  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-4">
      <header>
        <p className="text-sm font-semibold text-amber-950">進級予定</p>
        <p className="text-xs text-amber-900/80 mt-1">
          次のコースへの進級または飛び級の予定月を設定します。コマ表と生徒情報に表示されます。
        </p>
      </header>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          進級予定月
        </label>
        <input
          type="month"
          name="promotion_scheduled_ym"
          defaultValue={defaultPromotionScheduledYm ?? ""}
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">種別</legend>
        <div className="flex flex-wrap gap-4">
          {PROMOTION_TYPES.map((opt) => (
            <label
              key={opt.value}
              className="flex items-center gap-2 text-sm cursor-pointer"
            >
              <input
                type="radio"
                name="promotion_type"
                value={opt.value}
                defaultChecked={defaultPromotionType === opt.value}
                className="accent-brand-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
