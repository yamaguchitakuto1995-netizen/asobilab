import { describe, expect, it } from "vitest";
import {
  isPendingAbsenceMakeupOpen,
  makeupTargetMaxDate,
  pendingAbsenceMakeupRegistrationDeadlineDate,
} from "@/lib/registrationDeadlines";

describe("pending absence makeup deadline", () => {
  it("uses 3 days before 翌々月末 as registration deadline", () => {
    expect(makeupTargetMaxDate("2026-05-22")).toBe("2026-07-31");
    expect(pendingAbsenceMakeupRegistrationDeadlineDate("2026-05-22")).toBe(
      "2026-07-28"
    );
  });

  it("is open before deadline end of day JST", () => {
    const now = new Date("2026-07-28T14:59:59+09:00");
    expect(isPendingAbsenceMakeupOpen("2026-05-22", now)).toBe(true);
  });

  it("is closed after deadline end of day JST", () => {
    const now = new Date("2026-07-29T00:00:01+09:00");
    expect(isPendingAbsenceMakeupOpen("2026-05-22", now)).toBe(false);
  });
});
