// @ts-expect-error -- Bun's test module is supplied by the runtime without adding browser bundle types.
import { describe, expect, test } from "bun:test";
import { nextRangeSelection } from "@/lib/date-range";

const jan10 = new Date(2026, 0, 10);
const jan15 = new Date(2026, 0, 15);
const jan20 = new Date(2026, 0, 20);

describe("two-click date range selection", () => {
  test("the first click starts a draft without an end date", () => {
    expect(nextRangeSelection(undefined, jan10)).toEqual({ from: jan10 });
  });

  test("the second click completes the range", () => {
    expect(nextRangeSelection({ from: jan10 }, jan20)).toEqual({ from: jan10, to: jan20 });
  });

  test("an earlier second click normalizes the dates", () => {
    expect(nextRangeSelection({ from: jan20 }, jan10)).toEqual({ from: jan10, to: jan20 });
  });

  test("a third click starts a fresh range", () => {
    expect(nextRangeSelection({ from: jan10, to: jan20 }, jan15)).toEqual({ from: jan15 });
  });
});
