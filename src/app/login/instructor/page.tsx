import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { InstructorLoginForm } from "./InstructorLoginForm";

type SearchParams = Promise<{ error?: string }>;

export default async function InstructorLoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            <BrandMark />
          </h1>
          <p className="text-sm text-slate-500 mt-1">講師ログイン</p>
        </div>

        <InstructorLoginForm error={error} />

        <p className="text-xs text-slate-500 text-center mt-6 leading-relaxed">
          入力内容はこの端末に保存され、次回から自動入力されます。
          <br />
          ログアウトするまでログイン状態を維持します。
        </p>
      </div>
    </main>
  );
}
