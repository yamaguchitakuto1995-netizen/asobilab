import { describe, expect, it } from "vitest";
import { physicalTextbookLabel } from "./physicalTextbookLabel";
import { formatCarryOverMemoDisplay } from "./studentCarryOverMemo";
import { lessonTextbookInventoryLabel } from "./lessonTextbookInventory";

describe("physicalTextbookLabel", () => {
  it("merges 1周目 and 2周目 for 2周 courses", () => {
    expect(
      physicalTextbookLabel("ミドル（2周）", "1周目 / 7-1")
    ).toBe("ミドル 7-1");
    expect(
      physicalTextbookLabel("ミドル（2周）", "2周目 / 7-1")
    ).toBe("ミドル 7-1");
  });

  it("keeps non-2周 courses as course · unit", () => {
    expect(physicalTextbookLabel("プライマリー", "7-1")).toBe(
      "プライマリー · 7-1"
    );
  });
});

describe("formatCarryOverMemoDisplay", () => {
  it("falls back to note when persistent_memo is empty", () => {
    expect(
      formatCarryOverMemoDisplay({ note: "タブレット有り" })
    ).toBe("タブレット有り");
  });
});

describe("lessonTextbookInventoryLabel", () => {
  it("aggregates 1周目 and 2周目 under the same key", () => {
    const lap1 = lessonTextbookInventoryLabel({
      status: "scheduled",
      attendance: "present",
      subject: "ロボット",
      textbook: null,
      students: {
        next_text_robot: "ミドル（2周） / 1周目 / 7-1",
        next_text_programming: null,
        next_text_robot_course: "ミドル（2周）",
        next_text_robot_text: "1周目 / 7-1",
      },
    });
    const lap2 = lessonTextbookInventoryLabel({
      status: "scheduled",
      attendance: "present",
      subject: "ロボット",
      textbook: null,
      students: {
        next_text_robot: "ミドル（2周） / 2周目 / 7-1",
        next_text_programming: null,
        next_text_robot_course: "ミドル（2周）",
        next_text_robot_text: "2周目 / 7-1",
      },
    });
    expect(lap1).toBe("ミドル 7-1（ロボット）");
    expect(lap2).toBe(lap1);
  });
});
