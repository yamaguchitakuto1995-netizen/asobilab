"use client";

import { useEffect, useState } from "react";
import { Field, inputClass } from "@/components/Field";

type Props = {
  defaultScratchId?: string | null;
  defaultScratchPass?: string | null;
  defaultMinecraftLogin?: string | null;
};

export function StudentProgrammingLoginField({
  defaultScratchId,
  defaultScratchPass,
  defaultMinecraftLogin,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function sync() {
      const checked = document.querySelectorAll<HTMLInputElement>(
        'input[name="subjects"]:checked'
      );
      setVisible(
        Array.from(checked).some((el) => el.value === "プログラミング")
      );
    }

    sync();
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, []);

  if (!visible) return null;

  return (
    <div className="space-y-3 rounded-xl border-2 border-violet-300 bg-violet-50/80 px-3 py-4">
      <header>
        <p className="text-sm font-semibold text-violet-950">
          プログラミング・ログイン情報
        </p>
        <p className="text-xs text-violet-800/90 mt-1">
          プログラミング受講時はスクラッチが必須です。マイクラは任意です。
        </p>
      </header>

      <Field label="スクラッチ ID" htmlFor="scratch_login_id" required>
        <input
          id="scratch_login_id"
          name="scratch_login_id"
          type="text"
          maxLength={120}
          defaultValue={defaultScratchId ?? ""}
          className={inputClass}
          autoComplete="off"
        />
      </Field>

      <Field label="スクラッチ PASS" htmlFor="scratch_login_pass" required>
        <input
          id="scratch_login_pass"
          name="scratch_login_pass"
          type="text"
          maxLength={120}
          defaultValue={defaultScratchPass ?? ""}
          className={inputClass}
          autoComplete="off"
        />
      </Field>

      <Field
        label="マイクラ ID:PASS"
        htmlFor="minecraft_login"
        hint="任意。例: myid:mypass"
      >
        <input
          id="minecraft_login"
          name="minecraft_login"
          type="text"
          maxLength={200}
          defaultValue={defaultMinecraftLogin ?? ""}
          className={inputClass}
          placeholder="ID:PASS"
          autoComplete="off"
        />
      </Field>
    </div>
  );
}
