import Link from "next/link";
import { CLASSROOMS } from "@/lib/types";
import {
  resolveProgrammingNextTextPartsForStudent,
  resolveRobotNextTextPartsForStudent,
} from "@/lib/courseNextText";

type TextFields = {
  subjects: string[] | null | undefined;
  next_text_robot: string | null;
  next_text_programming: string | null;
  next_text_robot_course?: string | null;
  next_text_robot_text?: string | null;
  next_text_programming_course?: string | null;
  next_text_programming_text?: string | null;
};

type SectionProps = TextFields & {
  editHref?: string;
};

type SummaryProps = TextFields & {
  classroom?: string | null;
};

function coursesOfferedAtClassroom(classroom: string | null | undefined): string[] {
  if (!classroom) return [];
  const row = CLASSROOMS.find((c) => c.name === classroom);
  return row ? [...row.subjects] : [];
}

function NextTextDetailBlock({
  title,
  resolved,
  orphanTag,
}: {
  title: string;
  resolved: { course: string; text: string; full: string | null } | null;
  orphanTag: boolean;
}) {
  const courseLabel = resolved?.course?.trim()
    ? resolved.course
    : "—";
  const textLabel = resolved?.text?.trim() ? resolved.text : "—";

  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">
        {title}
        {orphanTag ? (
          <span className="ml-1 text-amber-700">（受講教科に未反映）</span>
        ) : null}
      </dt>
      <dd className="text-sm text-slate-900 mt-1 leading-snug break-words space-y-1">
        <div>
          <span className="text-slate-500 text-xs font-medium">コース</span>{" "}
          <span
            className={
              resolved?.course?.trim() ? "text-slate-900" : "text-slate-400"
            }
          >
            {courseLabel}
          </span>
        </div>
        <div>
          <span className="text-slate-500 text-xs font-medium">テキスト名</span>{" "}
          <span
            className={
              resolved?.text?.trim() ? "text-slate-900" : "text-slate-400"
            }
          >
            {textLabel}
          </span>
        </div>
        {resolved?.full ? (
          <div className="text-xs text-slate-500 pt-0.5 border-t border-slate-100">
            <span className="font-medium text-slate-600">表記（保存形式）</span>
            ：{resolved.full}
          </div>
        ) : resolved ? (
          <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1 mt-1">
            保存形式の値がカリキュラムと一致しません。編集画面で次回テキストを選び直してください。
          </div>
        ) : null}
      </dd>
    </div>
  );
}

/**
 * 生徒の教材（次回テキスト）を一覧表示。受講に含まれないが値だけ残っている場合も行を出す。
 */
export function StudentTextInfoSection({
  subjects = [],
  next_text_robot,
  next_text_programming,
  next_text_robot_course,
  next_text_robot_text,
  next_text_programming_course,
  next_text_programming_text,
  editHref,
}: SectionProps) {
  const subj = Array.isArray(subjects) ? subjects : [];

  const robotResolved = resolveRobotNextTextPartsForStudent({
    next_text_robot,
    next_text_robot_course,
    next_text_robot_text,
  });
  const progResolved = resolveProgrammingNextTextPartsForStudent({
    next_text_programming,
    next_text_programming_course,
    next_text_programming_text,
  });

  const orphanRobot = !subj.includes("ロボット") && !!robotResolved;
  const orphanProg =
    !subj.includes("プログラミング") && !!progResolved;

  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">テキスト情報</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            コース名とテキスト名を分けて表示します。下段の表記はデータベースに保存している従来形式（ロボットの2周コースは3段）です。
          </p>
          {editHref ? (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mt-2 leading-relaxed">
              <strong>プルダウン</strong>でコースやテキスト名を設定する場合は、この画面ではなく右の「
              <Link
                href={`${editHref}#student-next-text-curriculum`}
                className="font-semibold text-brand-700 underline"
              >
                編集
              </Link>
              」から開いてください（緑の枠内のセレクトです）。
            </p>
          ) : null}
        </div>
        {editHref ? (
          <Link
            href={editHref}
            className="shrink-0 text-xs font-medium text-brand-600 hover:underline"
          >
            編集
          </Link>
        ) : null}
      </div>

      <dl className="space-y-3">
        <NextTextDetailBlock
          title="ロボット（次回テキスト）"
          resolved={robotResolved}
          orphanTag={orphanRobot}
        />
        <NextTextDetailBlock
          title="プログラミング（次回テキスト）"
          resolved={progResolved}
          orphanTag={orphanProg}
        />
      </dl>
    </section>
  );
}

/** 生徒一覧カード用（コンパクト） */
export function StudentTextInfoSummary({
  subjects = [],
  classroom = null,
  next_text_robot,
  next_text_programming,
  next_text_robot_course,
  next_text_robot_text,
  next_text_programming_course,
  next_text_programming_text,
}: SummaryProps) {
  const subj = Array.isArray(subjects) ? subjects : [];
  const offered = coursesOfferedAtClassroom(classroom);
  const effective = new Set<string>([...subj, ...offered]);

  const robotResolved = resolveRobotNextTextPartsForStudent({
    next_text_robot,
    next_text_robot_course,
    next_text_robot_text,
  });
  const progResolved = resolveProgrammingNextTextPartsForStudent({
    next_text_programming,
    next_text_programming_course,
    next_text_programming_text,
  });

  const bits: { k: string; primary: string; notation?: string | null }[] = [];

  if (effective.has("ロボット") || robotResolved) {
    bits.push({
      k: "ロボット",
      primary: robotResolved
        ? `${robotResolved.course} · ${robotResolved.text}`
        : "未設定",
      notation: robotResolved?.full ?? null,
    });
  }
  if (effective.has("プログラミング") || progResolved) {
    bits.push({
      k: "プログラミング",
      primary: progResolved
        ? `${progResolved.course} · ${progResolved.text}`
        : "未設定",
      notation: progResolved?.full ?? null,
    });
  }
  if (bits.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/90 px-2.5 py-2">
      <p className="text-[10px] font-semibold text-slate-500 tracking-wide mb-1.5">
        テキスト情報
      </p>
      <ul className="space-y-1.5 text-[11px] text-slate-700 leading-snug">
        {bits.map((b) => (
          <li key={b.k}>
            <div>
              <span className="text-slate-500">{b.k}:</span>{" "}
              <span className="font-medium text-slate-800 break-words">
                {b.primary}
              </span>
            </div>
            {b.notation ? (
              <div className="text-[10px] text-slate-500 ml-0 mt-0.5 break-words">
                表記: {b.notation}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
