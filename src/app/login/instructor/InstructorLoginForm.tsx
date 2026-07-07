"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { readInstructorLoginSession, writeInstructorLoginSession } from "@/lib/instructorLoginSession";
import { instructorLogin } from "./actions";

type Props = {
  error?: string;
};

export function InstructorLoginForm({ error }: Props) {
  const [email, setEmail] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = readInstructorLoginSession();
    if (saved) {
      setEmail(saved.email);
      setPhoneLast4(saved.phoneLast4);
    }
    setHydrated(true);
  }, []);

  function handleSubmit(formData: FormData) {
    writeInstructorLoginSession({
      email: String(formData.get("email") ?? ""),
      phoneLast4: String(formData.get("phone_last4") ?? ""),
    });
    return instructorLogin(formData);
  }

  if (!hydrated) {
    return (
      <div className="h-40 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse" />
    );
  }

  return (
    <form
      action={handleSubmit}
      className="space-y-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
    >
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      <div>
        <label
          htmlFor="phone_last4"
          className="block text-sm font-medium mb-1.5"
        >
          電話番号（下4桁）
        </label>
        <input
          id="phone_last4"
          name="phone_last4"
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          autoComplete="tel-local"
          value={phoneLast4}
          onChange={(e) =>
            setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          placeholder="1234"
        />
        <p className="text-xs text-slate-500 mt-1">
          登録されている携帯・固定電話の下4桁を入力してください。
        </p>
      </div>

      {error ? (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {decodeURIComponent(error)}
        </p>
      ) : null}

      <button
        type="submit"
        className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 transition"
      >
        講師としてログイン
      </button>

      <p className="text-xs text-slate-500 text-center">
        管理者の方は{" "}
        <Link href="/login" className="text-brand-600 hover:underline">
          通常ログイン
        </Link>
      </p>
    </form>
  );
}
