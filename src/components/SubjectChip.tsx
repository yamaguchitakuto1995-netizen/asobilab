type Props = {
  subject: string | null | undefined;
  size?: "sm" | "md";
};

/**
 * 科目を文字列ハッシュで色分け。視覚的に同じ科目を一目で判別できるように。
 */
const PALETTE = [
  "bg-violet-100 text-violet-800 ring-violet-600/20",
  "bg-indigo-100 text-indigo-800 ring-indigo-600/20",
  "bg-sky-100 text-sky-800 ring-sky-600/20",
  "bg-teal-100 text-teal-800 ring-teal-600/20",
  "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  "bg-lime-100 text-lime-800 ring-lime-600/20",
  "bg-amber-100 text-amber-800 ring-amber-600/20",
  "bg-orange-100 text-orange-800 ring-orange-600/20",
  "bg-rose-100 text-rose-800 ring-rose-600/20",
  "bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-600/20",
];

function colorFor(subject: string): string {
  let h = 0;
  for (let i = 0; i < subject.length; i++) {
    h = (h * 31 + subject.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

export function SubjectChip({ subject, size = "sm" }: Props) {
  if (!subject) return null;
  const sizeClass = size === "md" ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${sizeClass} ${colorFor(subject)}`}
    >
      {subject}
    </span>
  );
}
