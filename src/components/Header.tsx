import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

type Props = {
  email: string | null;
  isAdmin?: boolean;
  isInstructor?: boolean;
};

export function Header({ email, isAdmin = false, isInstructor = false }: Props) {
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="font-bold tracking-tight text-slate-900 text-base sm:text-lg"
        >
          <BrandMark />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            ホーム
          </Link>
          <Link
            href="/students"
            className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          >
            生徒
          </Link>
          {isAdmin ? (
            <>
              <Link
                href="/capacities"
                className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                title="振替申請の受け入れ枠（人数）"
              >
                振替枠
              </Link>
              <Link
                href="/capacities/period-times"
                className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                title="教室・曜日・コマごとの表示用時刻（9:00〜 など）"
              >
                コマ時刻
              </Link>
              <Link
                href="/settings/instructors"
                className="px-2.5 sm:px-3 py-1.5 rounded-md text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                title="講師アカウントの登録・削除"
              >
                講師
              </Link>
            </>
          ) : null}

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
        <div className="border-t border-slate-100 bg-slate-50/60">
          <div className="mx-auto max-w-5xl px-4 py-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="truncate">ログイン中: {email}</span>
            {isAdmin ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset bg-brand-50 text-brand-800 ring-brand-600/20">
                管理者
              </span>
            ) : isInstructor ? (
              <span className="shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset bg-violet-50 text-violet-800 ring-violet-600/20">
                講師
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </header>
  );
}
