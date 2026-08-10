// @ts-expect-error -- Bun's test module is supplied by the runtime without browser bundle types.
import { describe, expect, test } from "bun:test";
import { transactionLineSummary } from "@/lib/transaction-line-summary";

describe("collapsed transaction item summaries", () => {
  test("shows inbound category, physical purity, weight, and cash total", () => {
    const summary = transactionLineSummary({
      index: 0,
      kind: "inbound",
      isReturn: false,
      method: null,
      categoryName: "خواتم",
      purity: 875,
      weight: 50,
      weight21: 50,
      cashAmount: 10_000,
    });

    expect(summary.title).toBe("بند 1 · وارد");
    expect(summary.specific).toBe("خواتم");
    expect(summary.meta).toContain("عيار 21");
    expect(summary.meta).toContain("50.00 جم");
    expect(summary.meta).toContain("10,000 ج");
  });

  test("shows the exact settlement method and 18-karat equivalent", () => {
    const summary = transactionLineSummary({
      index: 2,
      kind: "settlement",
      isReturn: false,
      method: "scrap_18",
      purity: 750,
      weight: 10,
      weight21: 8.57,
      cashAmount: 0,
    });

    expect(summary.title).toBe("بند 3 · تسديد");
    expect(summary.specific).toBe("كسر عيار 18");
    expect(summary.meta).toContain("عيار 18");
    expect(summary.meta).toContain("يعادل 8.57 جم عيار 21");
  });

  test("labels returned inbound goods as a return", () => {
    const summary = transactionLineSummary({
      index: 0,
      kind: "inbound",
      isReturn: true,
      method: null,
      categoryName: "غوايش",
      purity: 875,
      weight: 2,
      weight21: 2,
      cashAmount: 300,
    });

    expect(summary.title).toBe("بند 1 · مرتجع");
  });
});
