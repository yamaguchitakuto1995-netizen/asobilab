type Props = {
  defaultSkipPromotionYm?: string | null;
};

/** 飛び級の手動設定（任意）。未設定ならカリキュラムから自動進級を表示 */
export function StudentSkipPromotionField({
  defaultSkipPromotionYm,
}: Props) {
  const hasSkip = Boolean(defaultSkipPromotionYm?.trim());

  return (
    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-4">
      <header>
        <p className="text-sm font-semibold text-amber-950">飛び級予定（任意）</p>
        <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
          通常は設定不要です。次回テキストから「○年○月から□□へ自動進級」が自動表示されます。
          飛び級のときだけ予定月を指定してください。
        </p>
      </header>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">
          飛び級予定月
        </label>
        <input
          type="month"
          name="promotion_scheduled_ym"
          defaultValue={hasSkip ? defaultSkipPromotionYm ?? "" : ""}
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        {hasSkip ? (
          <p className="text-xs text-amber-800">
            現在: 飛び級予定あり。空にして保存すると自動進級表示に戻ります。
          </p>
        ) : null}
      </div>
    </div>
  );
}
