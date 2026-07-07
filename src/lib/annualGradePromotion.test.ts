import { describe, expect, it } from "vitest";
import {
  nextGradeLevel,
  prevGradeLevel,
  schoolYearStartYm,
} from "./annualGradePromotion";

describe("schoolYearStartYm", () => {
  it("returns April of current calendar year from July", () => {
    expect(schoolYearStartYm("2026-07-01")).toBe("2026-04");
  });

  it("returns previous calendar year April before April", () => {
    expect(schoolYearStartYm("2026-03-31")).toBe("2025-04");
  });
});

describe("prevGradeLevel", () => {
  it("demotes 小1 to 年長", () => {
    expect(prevGradeLevel("小1")).toBe("年長");
  });

  it("stops at 年少", () => {
    expect(prevGradeLevel("年少")).toBeNull();
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
