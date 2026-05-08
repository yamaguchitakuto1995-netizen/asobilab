type Props = {
  className?: string;
};

/** アプリ名（ヘッダー・ログインなどで共通表示） */
export function BrandMark({ className }: Props) {
  return (
    <span className={className}>
      ASOBI <span className="text-brand-600">Lab.</span>
    </span>
  );
}
