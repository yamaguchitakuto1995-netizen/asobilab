import { describe, expect, it } from "vitest";
import { buildNextMonthPromotionPreview } from "@/lib/dashboardPromotionPreview";

describe("buildNextMonthPromotionPreview", () => {
  it("lists students promoting next month by subject", () => {
    const preview = buildNextMonthPromotionPreview(
      [
        {
          id: "s1",
          name: "山田太郎",
          subjects: ["ロボット", "プログラミング"],
          promotion_scheduled_ym: "2026-09",
          promotion_type: "skip_grade",
          next_text_robot: "ベーシック（2周） / 1周目 / 9-1",
          next_text_programming: "ベーシック / 9-1",
        },
      ],
      "2026-08"
    );

    expect(preview.monthLabel).toBe("9月進級予定者");
    expect(preview.entries).toHaveLength(2);
    expect(preview.entries[0]).toMatchObject({
      studentName: "山田太郎",
      subject: "ロボット",
      promotionKindLabel: "飛び級進級",
    });
    expect(preview.entries[1]).toMatchObject({
      subject: "プログラミング",
      promotionKindLabel: "飛び級進級",
    });
  });

  it("includes auto-promotion estimate when skip grade is not set", () => {
    const preview = buildNextMonthPromotionPreview(
      [
        {
          id: "s2",
          name: "佐藤花子",
          subjects: ["ロボット"],
          promotion_type: "normal",
          course_start_robot_ym: "2026-01",
          next_text_robot: "プレプライマリー / 11-1",
        },
      ],
      "2026-05"
    );

    const robot = preview.entries.find((e) => e.subject === "ロボット");
    expect(robot?.promotionKindLabel).toBe("自動進級");
  });
});
