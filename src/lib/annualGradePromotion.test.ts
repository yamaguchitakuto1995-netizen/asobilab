import { describe, expect, it } from "vitest";
import { nextGradeLevel, schoolYearStartYm } from "./annualGradePromotion";

describe("schoolYearStartYm", () => {
  it("returns April of current calendar year from July", () => {
    expect(schoolYearStartYm("2026-07-01")).toBe("2026-04");
  });

  it("returns previous calendar year April before April", () => {
    expect(schoolYearStartYm("2026-03-31")).toBe("2025-04");
  });
});

describe("nextGradeLevel", () => {
  it("promotes 年長 to 小1", () => {
    expect(nextGradeLevel("年長")).toBe("小1");
  });

  it("stops at 高3", () => {
    expect(nextGradeLevel("高3")).toBeNull();
  });

  it("does not promote その他", () => {
    expect(nextGradeLevel("その他")).toBeNull();
  });
});
