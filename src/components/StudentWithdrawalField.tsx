type Props = {
  defaultValue?: string | null;
};

export function StudentWithdrawalField({ defaultValue }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">退会予定</label>
      <input
        type="month"
        name="withdrawal_until_ym"
        defaultValue={defaultValue ?? ""}
        className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <p className="text-xs text-slate-500">
        設定すると継続備考に「○月末退会」と表示され、退会予定月以降の授業予定は自動登録・表示されません。
      </p>
    </div>
  );
}
