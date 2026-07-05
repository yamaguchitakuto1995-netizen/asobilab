"use client";

import { useState, useTransition } from "react";
import { Field, inputClass } from "@/components/Field";
import { AvailabilityPicker } from "./AvailabilityPicker";
import { SiblingParticipantPicker } from "./SiblingParticipantPicker";
import { lookupStudent, type FoundStudent } from "./actions";

type Props = {
  periodTimes?: import("@/lib/types").ClassroomPeriodTime[];
  initialPortalId?: string;
  initialBirthday?: string;
};

/** 保護者の振替申請フロー全体を管理する Client Component */
export function MakeupApplyFlow({
  periodTimes = [],
  initialPortalId = "",
  initialBirthday = "",
}: Props) {
  const [student, setStudent] = useState<FoundStudent | null>(null);
  const [siblings, setSiblings] = useState<FoundStudent[]>([]);
  const [participants, setParticipants] = useState<FoundStudent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [portalId, setPortalId] = useState(initialPortalId);
  const [birthday, setBirthday] = useState(initialBirthday);

  function handleLookup(formData: FormData) {
    const input = {
      portalId: String(formData.get("portal_id") ?? ""),
      birthday: String(formData.get("birthday") ?? ""),
    };
    setPortalId(input.portalId);
    setBirthday(input.birthday);
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
        portalId={portalId}
        birthday={birthday}
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
        portalId={portalId}
        birthday={birthday}
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
          <h1 className="text-lg font-semibold">ログイン</h1>
          <p className="text-xs text-slate-500 mt-1">
            教室からお渡しした<strong>生徒ID</strong>と<strong>お子様の誕生日</strong>を入力してください。
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLookup(new FormData(e.currentTarget));
          }}
          className="space-y-4"
        >
          <Field
            label="生徒ID"
            htmlFor="portal_id"
            required
            hint="教室が発行した番号（半角英数字）"
          >
            <input
              id="portal_id"
              name="portal_id"
              type="text"
              required
              maxLength={20}
              pattern="[0-9A-Za-z\-]{1,20}"
              defaultValue={portalId}
              className={inputClass}
              placeholder="例: 10001"
              autoComplete="off"
              inputMode="text"
            />
          </Field>

          <Field label="お子様の誕生日" htmlFor="birthday" required>
            <input
              id="birthday"
              name="birthday"
              type="date"
              required
              defaultValue={birthday}
              className={inputClass}
            />
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
            振替申請は、欠席する授業の<strong>3日前 23:59</strong>までです（例: 6/27の授業 → 6/24 23:59まで）。
          </li>
          <li>
            欠席登録は、授業日の<strong>開始時刻まで</strong>です（コマ時刻が登録されている場合）。
          </li>
          <li>
            生徒ID・誕生日が分からない場合は、所属教室までお問い合わせください。
          </li>
          <li>
            手続きが完了すると、その内容はその場で予定に反映されます（教室からの承認を経る流れではありません）。
          </li>
          <li>「欠席のみ」で先に欠席登録、「振替のみ」で後から振替先を選べます。「まとめて」は従来どおり一度に登録できます。</li>
          <li>欠席にする授業は、フォームに表示される「出席予定」「振替予定」「欠席済み」のカードから選べます。</li>
          <li>振替先は所属教室以外の空きコマも選べます。振替授業を再度別のコマへ振り替えることも可能です。</li>
          <li>振替先も、各授業日の<strong>3日前 23:59</strong>までに申請できます（欠席申請と同じ締切ルール）。</li>
          <li>振替先は<strong>欠席月の翌々月末まで</strong>選べます（例: 7月欠席 → 9月末まで）。</li>
          <li>
            <strong>欠席済み</strong>の授業への振替登録は、欠席月の<strong>翌々月末 23:59</strong>までです（例: 8/1欠席 → 10/31 23:59まで）。
          </li>
          <li>振替先は、すでに授業がある日でも<strong>別のコマ</strong>なら選べます（例: 8/15の3コマ目あり → 8/15の4コマ目へ振替可）。</li>
          <li>すでに授業が登録されているコマは「授業あり」と表示され、選べません。</li>
          <li>欠席月より前の月には振替できません（例: 8/4欠席 → 7/28へは不可）。</li>
          <li>空き状況は他の方の申請でリアルタイムに変動します。</li>
          <li>満員のコマは灰色で表示されます。</li>
        </ul>
      </div>
    </div>
  );
}
