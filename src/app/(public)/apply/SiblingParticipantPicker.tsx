"use client";

import { useState } from "react";
import type { FoundStudent } from "./actions";

type Props = {
  primary: FoundStudent;
  siblings: FoundStudent[];
  onConfirm: (participants: FoundStudent[]) => void;
  onBack: () => void;
};

export function SiblingParticipantPicker({
  primary,
  siblings,
  onConfirm,
  onBack,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  function toggleSibling(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmPrimaryOnly() {
    onConfirm([primary]);
  }

  function confirmWithSelected() {
    const extra = siblings.filter((s) => selectedIds.has(s.id));
    onConfirm([primary, ...extra]);
  }

  function confirmAll() {
    onConfirm([primary, ...siblings]);
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-brand-200 rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">振替申請するお子様</h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            {primary.name} さんに兄弟・姉妹が登録されています。今回の振替申請に含めるお子様を選んでください。1回の入力でまとめて申請できます。
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <span className="font-medium text-slate-900">{primary.name}</span>
          <span className="text-xs text-slate-500 ml-2">
            ({primary.grade} / {primary.classroom}) — 必ず含まれます
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            一緒に振替申請する兄弟・姉妹（任意）
          </p>
          <ul className="space-y-2">
            {siblings.map((s) => (
              <li key={s.id}>
                <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 cursor-pointer hover:border-brand-300">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleSibling(s.id)}
                    className="mt-0.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    <span className="font-medium text-slate-900">{s.name}</span>
                    <span className="block text-xs text-slate-500">
                      {s.grade} / {s.classroom}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={confirmPrimaryOnly}
            className="flex-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium px-4 py-2.5"
          >
            {primary.name} さんのみ
          </button>
          <button
            type="button"
            onClick={confirmAll}
            className="flex-1 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5"
          >
            兄弟全員まとめて申請
          </button>
          <button
            type="button"
            onClick={confirmWithSelected}
            disabled={selectedIds.size === 0}
            className="flex-1 rounded-lg border border-brand-300 bg-brand-50 hover:bg-brand-100 text-brand-900 text-sm font-medium px-4 py-2.5 disabled:opacity-50"
          >
            {selectedIds.size === 0
              ? "選んだ兄弟のみ申請"
              : `選んだ ${selectedIds.size}名と申請`}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="text-sm text-slate-500 hover:text-slate-700"
      >
        ← お子様情報の入力に戻る
      </button>
    </div>
  );
}
