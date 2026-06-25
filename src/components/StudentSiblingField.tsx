"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, inputClass } from "@/components/Field";
import type { SiblingSummary } from "@/lib/siblings";

type Props = {
  candidates: SiblingSummary[];
  defaultHasSiblings?: boolean;
  defaultSiblingIds?: string[];
  /** 編集画面など: 紐付け済み兄弟の表示用 */
  linkedSiblings?: SiblingSummary[];
};

export function StudentSiblingField({
  candidates,
  defaultHasSiblings = false,
  defaultSiblingIds = [],
  linkedSiblings = [],
}: Props) {
  const [hasSiblings, setHasSiblings] = useState(defaultHasSiblings);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setHasSiblings(defaultHasSiblings);
  }, [defaultHasSiblings]);

  const selectedSet = useMemo(
    () => new Set(defaultSiblingIds),
    [defaultSiblingIds]
  );

  const linkedNames =
    linkedSiblings.length > 0
      ? linkedSiblings
      : candidates.filter((c) => selectedSet.has(c.id));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.classroom ?? "").toLowerCase().includes(q) ||
        c.grade.toLowerCase().includes(q)
    );
  }, [candidates, query]);

  return (
    <div
      id="student-siblings"
      className="rounded-xl border-2 border-violet-300 bg-violet-50 p-3 sm:p-4 space-y-3 scroll-mt-4"
    >
      <div>
        <p className="text-sm font-semibold text-violet-950">兄弟・姉妹</p>
        <p className="text-xs text-violet-900/80 mt-0.5 leading-relaxed">
          振替申請フォームで、お子様だけ・兄弟全員を1回の入力で選べるようにします。
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
        <input
          type="checkbox"
          name="has_siblings"
          value="1"
          checked={hasSiblings}
          onChange={(e) => setHasSiblings(e.target.checked)}
          className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        />
        兄弟・姉妹がいる
      </label>

      {hasSiblings ? (
        <div className="space-y-2">
          {linkedNames.length > 0 ? (
            <p className="text-xs text-violet-900 bg-white border border-violet-200 rounded-lg px-3 py-2">
              <span className="font-semibold">兄弟あり</span>
              {" — "}
              {linkedNames.map((s) => s.name).join("、")}
            </p>
          ) : null}

          <Field
            label="兄弟・姉妹を選ぶ"
            htmlFor="sibling_search"
            hint="登録済みの生徒から選びます（複数可）。"
          >
            <input
              id="sibling_search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名前・教室で絞り込み"
              className={inputClass}
              autoComplete="off"
            />
          </Field>

          {candidates.length === 0 ? (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
              他に登録済みの生徒がいません。先に兄弟の生徒を登録してから紐付けしてください。
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-slate-500">該当する生徒がいません。</p>
          ) : (
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
              {filtered.map((c) => (
                <li key={c.id}>
                  <label className="flex items-start gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      name="sibling_ids"
                      value={c.id}
                      defaultChecked={selectedSet.has(c.id)}
                      className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="min-w-0">
                      <span className="font-medium text-slate-900">{c.name}</span>
                      <span className="block text-xs text-slate-500">
                        {c.grade}
                        {c.classroom ? ` · ${c.classroom}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
