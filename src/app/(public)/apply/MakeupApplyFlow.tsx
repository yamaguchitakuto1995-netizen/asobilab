"use client";

import { useState, useTransition } from "react";
import { Field, inputClass } from "@/components/Field";
import { GRADE_LEVELS, type ClassroomPeriodTime, type ClassroomRecord } from "@/lib/types";
import { AvailabilityPicker } from "./AvailabilityPicker";
import { SiblingParticipantPicker } from "./SiblingParticipantPicker";
import { lookupStudent, type FoundStudent } from "./actions";

type Props = {
  periodTimes?: ClassroomPeriodTime[];
  classrooms?: ClassroomRecord[];
  initialName?: string;
  initialClassroom?: string;
  initialGrade?: string;
};

/** 保護者の振替申請フロー全体を管理する Client Component */
export function MakeupApplyFlow({
  periodTimes = [],
  classrooms = [],
  initialName = "",
  initialClassroom = "",
  initialGrade = "",
}: Props) {
  const [student, setStudent] = useState<FoundStudent | null>(null);
  const [siblings, setSiblings] = useState<FoundStudent[]>([]);
  const [participants, setParticipants] = useState<FoundStudent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 入力保持 (再表示時の利便性)
  const [name, setName] = useState(initialName);
  const [classroom, setClassroom] = useState(initialClassroom);
  const [grade, setGrade] = useState(initialGrade);

  function handleLookup(formData: FormData) {
    const input = {
      name: String(formData.get("name") ?? ""),
      classroom: String(formData.get("classroom") ?? ""),
      grade: String(formData.get("grade") ?? ""),
    };
    setName(input.name);
    setClassroom(input.classroom);
    setGrade(input.grade);
    setError(null);
    startTransition(async () => {
      try {
        const result = await lookupStudent(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setStudent(result.student);
        setSiblings(result.siblings);
        setParticipants(null);
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "確認中にエラーが発生しました。しばらくしてから再度お試しください。"
        );
      }
    });
  }

  if (participants) {
    return (
      <AvailabilityPicker
        students={participants}
        periodTimes={periodTimes}
        onBack={() => {
          setParticipants(null);
          setError(null);
        }}
        onReset={() => {
          setStudent(null);
          setSiblings([]);
          setParticipants(null);
          setError(null);
        }}
      />
    );
  }

  if (student && siblings.length > 0) {
    return (
      <SiblingParticipantPicker
        primary={student}
        siblings={siblings}
        onConfirm={setParticipants}
        onBack={() => {
          setStudent(null);
          setSiblings([]);
          setError(null);
        }}
      />
    );
  }

  if (student) {
    return (
      <AvailabilityPicker
        students={[student]}
        periodTimes={periodTimes}
        onBack={() => {
          setStudent(null);
          setSiblings([]);
          setError(null);
        }}
        onReset={() => {
          setStudent(null);
          setSiblings([]);
          setError(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold">お子様の情報をご入力ください</h1>
          <p className="text-xs text-slate-500 mt-1">
            ご登録のお名前・所属教室・学年が一致する場合のみ、振替申請にお進みいただけます。
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          <Field label="お子様のお名前" htmlFor="name" required hint="登録時のお名前 (姓名のあいだの空白も含めて)">
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={80}
              defaultValue={name}
              className={inputClass}
              placeholder="例) 山田 太郎"
              autoComplete="off"
            />
          </Field>

          <Field label="所属教室" htmlFor="classroom" required>
            <select
              id="classroom"
              name="classroom"
              required
              defaultValue={classroom}
              className={inputClass}
            >
              <option value="" disabled>
                選択してください
              </option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="学年" htmlFor="grade" required>
            <select
              id="grade"
              name="grade"
              required
              defaultValue={grade}
              className={inputClass}
            >
              <option value="" disabled>
                選択してください
              </option>
              {GRADE_LEVELS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>

          {error ? (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5 disabled:opacity-60"
          >
            {isPending ? "確認中…" : "次へ進む"}
          </button>
        </form>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">ご利用にあたって</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            手続きが完了すると、その内容はその場で予定に反映されます（教室からの承認を経る流れではありません）。
          </li>
          <li>欠席にする授業は、フォームに表示される「出席予定」のカードからのみ選べます。</li>
          <li>振替先の日付は、今日からおおよそ 4 ヶ月（120 日）先までお選びいただけます。</li>
          <li>空き状況は他の方の申請でリアルタイムに変動します。</li>
          <li>満員のコマは灰色で表示されます。</li>
          <li>ご不明な点は所属教室までお問い合わせください。</li>
        </ul>
      </div>
    </div>
  );
}
