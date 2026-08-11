// @ts-expect-error -- Bun's test module is supplied by the runtime without browser bundle types.
import { describe, expect, test } from "bun:test";
import {
  formatArabicDate,
  formatArabicDateRange,
  formatArabicDateTime,
  parseLocalDate,
} from "@/lib/date-format";

describe("Arabic date formatting", () => {
  test("formats date-only values with an Arabic month and Latin digits", () => {
    expect(formatArabicDate("2026-08-10")).toBe("10 أغسطس 2026");
  });

  test("keeps date-only values on the requested local calendar day", () => {
    const date = parseLocalDate("2026-08-10");
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 8, 10]);
  });

  test("formats a complete range in reading order", () => {
    expect(formatArabicDateRange(new Date(2026, 7, 1), new Date(2026, 7, 10))).toBe(
      "1 أغسطس 2026 — 10 أغسطس 2026",
    );
  });

  test("formats activity timestamps without reversed date fragments", () => {
    expect(formatArabicDateTime(new Date(2026, 7, 10, 21, 41))).toContain("10 أغسطس 2026");
  });
});
