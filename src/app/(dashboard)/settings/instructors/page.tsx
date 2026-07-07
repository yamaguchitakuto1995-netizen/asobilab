import { redirect } from "next/navigation";
import { ConfirmDeleteForm } from "@/components/ConfirmDeleteForm";
import { PageHeader } from "@/components/PageHeader";
import { getCurrentUser } from "@/lib/auth";
import { phoneLastFour } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInstructor,
  removeInstructor,
  updateInstructor,
} from "./actions";

type SearchParams = Promise<{ error?: string; message?: string }>;

export default async function InstructorsSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) redirect("/");

  const { error, message } = await searchParams;
  const admin = createAdminClient();
  const { data: instructors } = await admin
    .from("teacher_profiles")
    .select("id, email, display_name, phone, created_at")
    .eq("account_role", "staff")
    .eq("is_admin", false)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="講師アカウント"
        description="講師はメールアドレスと電話番号の下4桁でログインします。設定の変更や生徒の編集はできません。"
      />

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

      <section className="bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          講師を追加
        </h2>
        <form action={createInstructor} className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              メールアドレス
            </label>
            <input
              name="email"
              type="email"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              電話番号
            </label>
            <input
              name="phone"
              type="tel"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="09012345678"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              表示名（任意）
            </label>
            <input
              name="display_name"
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2"
            >
              講師を登録
            </button>
          </div>
        </form>
        <p className="text-xs text-slate-500 mt-3">
          講師にはログイン用URL{" "}
          <code className="text-[11px] bg-slate-100 px-1 rounded">/login/instructor</code>{" "}
          を共有してください。
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-3">
          登録済み講師
        </h2>
        {(instructors ?? []).length > 0 ? (
          <ul className="space-y-3">
            {(instructors ?? []).map((row) => (
              <li
                key={row.id}
                className="bg-white border border-slate-200 rounded-2xl p-4"
              >
                <form action={updateInstructor} className="space-y-3">
                  <input type="hidden" name="user_id" value={row.id} />
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        メールアドレス
                      </label>
                      <input
                        name="email"
                        type="email"
                        required
                        defaultValue={row.email}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        電話番号
                      </label>
                      <input
                        name="phone"
                        type="tel"
                        required
                        defaultValue={row.phone ?? ""}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        ログイン下4桁:{" "}
                        {row.phone ? phoneLastFour(row.phone) : "未設定"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        表示名（任意）
                      </label>
                      <input
                        name="display_name"
                        type="text"
                        defaultValue={row.display_name ?? ""}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg border border-brand-300 bg-brand-50 hover:bg-brand-100 text-brand-800 text-sm font-medium px-3 py-1.5"
                  >
                    保存
                  </button>
                </form>
                <div className="flex justify-end mt-2">
                  <ConfirmDeleteForm
                    action={removeInstructor}
                    message={`${row.email} の講師権限を削除します。よろしいですか？`}
                    buttonLabel="削除"
                  >
                    <input type="hidden" name="user_id" value={row.id} />
                  </ConfirmDeleteForm>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-sm text-slate-500">
            講師はまだ登録されていません。
          </div>
        )}
      </section>
    </div>
  );
}
