"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Field, inputClass } from "@/components/Field";
import { ParentLessonScheduleList } from "@/components/ParentLessonScheduleList";
import {
  applyUrlWithSession,
  clearParentPortalSession,
  readParentPortalSession,
  writeParentPortalSession,
} from "@/lib/parentPortalSession";
import type { ClassroomPeriodTime } from "@/lib/types";
import {
  listStudentScheduleForPortal,
  lookupStudentForSchedule,
  type FoundStudent,
} from "./actions";

type Props = {
  periodTimes?: ClassroomPeriodTime[];
  initialPortalId?: string;
  initialBirthday?: string;
};

type ScheduleState = {
  participants: FoundStudent[];
  lessonsByStudent: Record<string, Awaited<ReturnType<typeof listStudentScheduleForPortal>>>;
};

export function ScheduleFlow({
  periodTimes = [],
  initialPortalId = "",
  initialBirthday = "",
}: Props) {
  const [portalId, setPortalId] = useState(initialPortalId);
  const [birthday, setBirthday] = useState(initialBirthday);
  const [schedule, setSchedule] = useState<ScheduleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [autoTried, setAutoTried] = useState(false);

  const loadSchedule = useCallback(
    (creds: { portalId: string; birthday: string }) => {
      setError(null);
      startTransition(async () => {
        try {
          const lookup = await lookupStudentForSchedule(creds);
          if (!lookup.ok) {
            setError(lookup.error);
            setSchedule(null);
            clearParentPortalSession();
            return;
          }

          writeParentPortalSession(creds);
          setPortalId(creds.portalId);
          setBirthday(creds.birthday);

          const participants = [lookup.student, ...lookup.siblings];
          const results = await Promise.all(
            participants.map(async (s) => ({
              id: s.id,
              result: await listStudentScheduleForPortal({
                studentId: s.id,
                portalId: creds.portalId,
                birthday: creds.birthday,
                subjects: s.subjects,
              }),
            }))
          );

          const failed = results.find((r) => !r.result.ok);
          if (failed && !failed.result.ok) {
            setError(failed.result.error);
            setSchedule(null);
            return;
          }

          const lessonsByStudent = Object.fromEntries(
            results.map((r) => [r.id, r.result])
          );
          setSchedule({ participants, lessonsByStudent });
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "予定の取得に失敗しました。しばらくしてから再度お試しください。"
          );
          setSchedule(null);
        }
      });
    },
    []
  );

  useEffect(() => {
    if (autoTried) return;
    setAutoTried(true);
    const fromUrl =
      initialPortalId.trim() && initialBirthday.trim()
        ? { portalId: initialPortalId.trim(), birthday: initialBirthday.trim() }
        : null;
    const stored = readParentPortalSession();
    const creds = fromUrl ?? stored;
    if (creds) {
      loadSchedule(creds);
    }
  }, [autoTried, initialPortalId, initialBirthday, loadSchedule]);

  function handleLogin(formData: FormData) {
    loadSchedule({
      portalId: String(formData.get("portal_id") ?? ""),
      birthday: String(formData.get("birthday") ?? ""),
    });
  }

  function handleLogout() {
    clearParentPortalSession();
    setSchedule(null);
    setPortalId("");
    setBirthday("");
    setError(null);
  }

  if (schedule) {
    const applyHref = applyUrlWithSession({ portalId, birthday });
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">ログイン中</p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              {schedule.participants.map((s) => `${s.name}さん`).join("・")}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >
            ログアウト
          </button>
        </div>

        <section className="space-y-6">
          <h3 className="text-base font-semibold text-slate-800">授業日</h3>
          {schedule.participants.map((student) => {
            const result = schedule.lessonsByStudent[student.id];
            const lessons = result?.ok ? result.lessons : [];
            return (
              <div key={student.id} className="space-y-2">
                {schedule.participants.length > 1 ? (
                  <p className="text-sm font-medium text-slate-700">
                    {student.name} さん
                  </p>
                ) : null}
                {result && !result.ok ? (
                  <p className="text-sm text-rose-600">{result.error}</p>
                ) : (
                  <ParentLessonScheduleList
                    lessons={lessons}
                    studentName={student.name}
                    studentClassroom={student.classroom}
                    periodTimes={periodTimes}
                  />
                )}
              </div>
            );
          })}
        </section>

        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5 text-center space-y-3">
          <p className="text-sm text-slate-700">
            欠席・振替のお申し込みはこちらから
          </p>
          <Link
            href={applyHref}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5"
          >
            振替申請フォームへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">ログイン</h2>
          <p className="text-xs text-slate-500 mt-1">
            教室からお渡しした<strong>生徒ID</strong>と<strong>お子様の誕生日</strong>を入力してください。次回から自動でログインします。
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin(new FormData(e.currentTarget));
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
              autoComplete="username"
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
            {isPending ? "確認中…" : "授業日を見る"}
          </button>
        </form>
      </div>

      <p className="text-xs text-slate-500 text-center">
        振替の申請は
        <Link href="/apply" className="text-brand-700 hover:underline mx-1">
          振替申請フォーム
        </Link>
        から行えます。
      </p>
    </div>
  );
}
