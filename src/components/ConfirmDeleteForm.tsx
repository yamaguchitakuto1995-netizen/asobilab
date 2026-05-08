"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Props = {
  /** Server Action */
  action: (formData: FormData) => Promise<void> | void;
  /** 確認ダイアログのメッセージ */
  message: string;
  /** form 全体に渡すクラス */
  className?: string;
  /** 通常は <input type="hidden" /> を渡す */
  children?: ReactNode;
  /** 削除ボタン (＝ submit) のラベル。デフォルト「削除」 */
  buttonLabel?: ReactNode;
  /** 削除ボタンに当てるクラス */
  buttonClassName?: string;
  /** 削除ボタンの title 属性 */
  buttonTitle?: string;
};

/**
 * Server Action を発火する form を、ブラウザ標準の confirm() ダイアログでラップする
 * Client Component。
 *
 * - JS が無効でも form action は通常通り飛ぶ (確認なしでそのまま削除)
 * - JS が有効なら confirm() で中断可能
 * - useFormStatus で submit 中はボタンを「削除中…」に切り替え二重送信を防止
 */
export function ConfirmDeleteForm({
  action,
  message,
  className,
  children,
  buttonLabel = "削除",
  buttonClassName = "text-xs text-rose-600 hover:text-rose-700 hover:underline disabled:opacity-50 disabled:cursor-not-allowed",
  buttonTitle,
}: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
      className={className}
    >
      {children}
      <SubmitButton
        label={buttonLabel}
        className={buttonClassName}
        title={buttonTitle}
      />
    </form>
  );
}

function SubmitButton({
  label,
  className,
  title,
}: {
  label: ReactNode;
  className?: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} title={title} className={className}>
      {pending ? "削除中…" : label}
    </button>
  );
}
