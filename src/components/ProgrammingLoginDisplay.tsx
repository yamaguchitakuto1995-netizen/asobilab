import type { ProgrammingLoginFields } from "@/lib/studentProgrammingLogin";

type Props = {
  student: ProgrammingLoginFields;
  compact?: boolean;
};

/** プログラミング生徒のスクラッチ・マイクラログイン表示 */
export function ProgrammingLoginDisplay({ student, compact = false }: Props) {
  const scratchId = student.scratch_login_id?.trim();
  const scratchPass = student.scratch_login_pass?.trim();
  const minecraft = student.minecraft_login?.trim();

  if (!scratchId && !scratchPass && !minecraft) return null;

  const boxClass = compact
    ? "rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-2 text-[10px] leading-relaxed text-violet-950"
    : "rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950";

  return (
    <div className={boxClass}>
      <p className={`font-semibold ${compact ? "text-[10px]" : "text-sm"} text-violet-900`}>
        スクラッチログイン情報
      </p>
      <dl className={`mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 ${compact ? "font-mono" : ""}`}>
        <dt className="text-violet-700">ID</dt>
        <dd className="font-medium break-all">{scratchId || "—"}</dd>
        <dt className="text-violet-700">PASS</dt>
        <dd className="font-medium break-all">{scratchPass || "—"}</dd>
      </dl>
      {minecraft ? (
        <div className="mt-2 pt-2 border-t border-violet-200/80">
          <p className={`font-semibold ${compact ? "text-[10px]" : "text-sm"} text-violet-900`}>
            マイクラログイン情報
          </p>
          <p className={`mt-0.5 font-medium break-all ${compact ? "font-mono" : ""}`}>
            {minecraft}
          </p>
        </div>
      ) : null}
    </div>
  );
}
