import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

type Props = {
  email: string | null;
};

export function ParentHeader({ email }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-sky-200">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
        <Link
          href="/parent"
          className="font-bold tracking-tight text-slate-900 text-base sm:text-lg"
        >
          <BrandMark />
          <span className="ml-2 text-xs font-normal text-sky-700">保護者</span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/parent"
            className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            お子様の予定
          </Link>
          <Link
            href="/apply"
            className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            振替申請
          </Link>

          <form action="/auth/signout" method="post" className="ml-1 sm:ml-2">
            <button
              type="submit"
              className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              title={email ?? undefined}
            >
              ログアウト
            </button>
          </form>
        </nav>
      </div>

      {email ? (
        <div className="border-t border-sky-100 bg-sky-50/50">
          <div className="mx-auto max-w-5xl px-4 py-1 flex items-center gap-2 text-xs text-sky-800/80">
            <span className="truncate">ログイン中: {email}</span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
