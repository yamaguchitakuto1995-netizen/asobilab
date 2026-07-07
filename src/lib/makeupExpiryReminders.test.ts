import { describe, expect, it } from "vitest";
import { formatMakeupExpiryReminderMessage } from "@/lib/makeupExpiryReminders";

describe("formatMakeupExpiryReminderMessage", () => {
  it("formats the admin reminder text", () => {
    expect(
      formatMakeupExpiryReminderMessage("山田太郎", "2026-05-22")
    ).toBe(
      "山田太郎さんの5月22日欠席分の振替が失効しました。必要に応じて進度調整をしてください。"
    );
  });
});
