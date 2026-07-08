import { describe, expect, it } from "vitest";
import {
  formatAbsenceRegisteredLineMessage,
  formatAttendanceWithMemoLineMessage,
  formatMakeupRegisteredLineMessage,
} from "@/lib/appLineNotifications";

describe("appLineNotifications", () => {
  it("formats absence registration message", () => {
    const text = formatAbsenceRegisteredLineMessage({
      studentName: "佐々木 喜平",
      slot: {
        lessonDate: "2026-07-10",
        period: 2,
        subject: "ロボット",
      },
      source: "保護者フォーム",
    });

    expect(text).toContain("【欠席登録】");
    expect(text).toContain("佐々木 喜平");
    expect(text).toContain("2コマ目");
    expect(text).toContain("登録: 保護者フォーム");
  });

  it("formats makeup registration message", () => {
    const text = formatMakeupRegisteredLineMessage({
      studentName: "山田太郎",
      sourceSlot: {
        lessonDate: "2026-07-10",
        period: 2,
        subject: "ロボット",
      },
      targetSlot: {
        lessonDate: "2026-07-15",
        period: 3,
        subject: "ロボット",
      },
      source: "職員登録",
    });

    expect(text).toContain("【振替登録】");
    expect(text).toContain("欠席:");
    expect(text).toContain("振替:");
    expect(text).toContain("登録: 職員登録");
  });

  it("formats attendance with memo message", () => {
    const text = formatAttendanceWithMemoLineMessage({
      studentName: "佐藤花子",
      lessonDate: "2026-07-07",
      period: 1,
      subject: "プログラミング",
      attendance: "present",
      textMemo: "次回は持ち帰り課題を確認",
      persistentMemo: "アレルギーあり",
    });

    expect(text).toContain("【備考あり出席登録】");
    expect(text).toContain("出欠: 出席");
    expect(text).toContain("備考: 次回は持ち帰り課題を確認");
    expect(text).toContain("継続備考: アレルギーあり");
  });
});
