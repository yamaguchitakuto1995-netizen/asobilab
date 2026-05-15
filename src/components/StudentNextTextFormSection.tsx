import { StudentNextTextPickersPanel } from "@/components/StudentNextTextPickersPanel";
import type { StudentNextTextPickerDefaults } from "@/components/StudentNextTextPickersPanel";

/**
 * 次回テキスト枠。外枠と見出しはサーバーから必ず HTML に含まれる（キャッシュずれの切り分け用）。
 */
export function StudentNextTextFormSection(props: StudentNextTextPickerDefaults) {
  return (
    <div
      id="student-next-text-curriculum"
      role="region"
      aria-label="次回テキスト（カリキュラム）"
      className="space-y-4 rounded-xl border-[3px] border-emerald-600 bg-emerald-100/80 px-3 py-4 shadow-md scroll-mt-24"
      data-testid="student-next-text-pickers"
    >
      <header className="space-y-2">
        <p className="text-base font-bold text-emerald-950 leading-snug">
          次回テキスト：コースとテキスト名（この緑枠は「所属教室」より上）
        </p>
        <p className="text-xs leading-relaxed text-slate-900">
          <strong>この緑枠とこの文章はサーバーから配信されています。</strong>
          枠の中に「ロボット・次回テキスト」などのラベル付きプルダウンが続きます。続きが真っ白ならブラウザの
          <strong> ⌘+Shift+R </strong>
          で再読み込みするか、本番ならこのアプリの最新デプロイを確認してください。
        </p>
      </header>
      <StudentNextTextPickersPanel {...props} />
    </div>
  );
}
