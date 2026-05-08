import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { login, signup } from "./actions";

type SearchParams = Promise<{ error?: string; message?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            <BrandMark />
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            教室スタッフ・保護者ログイン（
            <Link href="/parent" className="text-brand-600 hover:underline">
              予定確認
            </Link>
            ）
          </p>
        </div>

        <div className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-left text-sm text-sky-900">
          <p className="font-medium text-sky-950">保護者の方へ</p>
          <p className="mt-1 text-sky-900/90 leading-snug">
            振替のお申し込みは<strong>ログイン不要</strong>です。下記からお進みください。
          </p>
          <Link
            href="/apply"
            className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800 hover:underline"
          >
            振替申請フォームへ →
          </Link>
        </div>

        <form className="space-y-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium mb-1.5"
            >
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {error ? (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {decodeURIComponent(error)}
            </p>
          ) : null}
          {message ? (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {decodeURIComponent(message)}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2">
            <button
              formAction={login}
              className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 transition"
            >
              ログイン
            </button>
            <button
              formAction={signup}
              className="w-full rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 transition"
            >
              新規登録（招待制）
            </button>
          </div>
        </form>

        <p className="text-xs text-slate-500 text-center mt-6 leading-relaxed">
          スタッフ用アカウントの発行・新規登録の可否は管理者にご確認ください。
          <br />
          <Link href="/" className="text-brand-600 hover:underline">
            ログイン後のトップへ
          </Link>
        </p>
      </div>
    </main>
  );
}
