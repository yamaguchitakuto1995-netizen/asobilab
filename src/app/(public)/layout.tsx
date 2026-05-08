import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

/**
 * (public) グループのレイアウト。認証不要のページ用。
 * 保護者向けの落ち着いた配色 + ダッシュボードヘッダーは出さない。
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <Link
            href="/apply"
            className="font-bold tracking-tight text-slate-900 text-base sm:text-lg"
          >
            <BrandMark />
            <span className="ml-2 text-xs font-normal text-slate-500">
              振替申請フォーム
            </span>
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">{children}</div>
      </main>
      <footer className="bg-white border-t border-slate-200">
        <div className="mx-auto max-w-2xl px-4 py-3 text-xs text-slate-500 text-center">
          ご不明な点がありましたら教室までお問い合わせください。
        </div>
      </footer>
    </div>
  );
}
