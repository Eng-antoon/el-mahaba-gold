// @ts-expect-error -- Bun's test module is supplied by the runtime without adding browser bundle types.
import { describe, expect, test } from "bun:test";
import { computeLine, fromGold21, toGold21 } from "./gold-math";

const base = {
  purity: 875,
  weight: 0,
  rate: 0,
  amount: 0,
  goldPrice: 0,
};

describe("gold conversion", () => {
  test("converts 18 karat to the 21-karat ledger", () => {
    expect(toGold21(100, 750)).toBe(85.71);
  });

  test("converts a 21-karat obligation to 18-karat physical gold", () => {
    expect(fromGold21(100, 750)).toBe(116.67);
  });

  test("rounds every conversion to two decimals", () => {
    expect(toGold21(100, 830)).toBe(94.86);
  });
});

describe("ledger movements", () => {
  test("merchandise inbound increases gold and workmanship owed", () => {
    expect(computeLine({ ...base, kind: "inbound", purity: 750, weight: 100, rate: 300 })).toEqual({
      weight21: 85.71,
      cashAmount: 30000,
      goldDelta: 85.71,
      cashDelta: 30000,
    });
  });

  test("cash settlement reduces only cash owed", () => {
    expect(computeLine({ ...base, kind: "settlement", method: "cash", amount: 5000 })).toEqual({
      weight21: 0,
      cashAmount: 5000,
      goldDelta: 0,
      cashDelta: -5000,
    });
  });

  test("18-karat scrap reduces the converted gold debt", () => {
    expect(
      computeLine({ ...base, kind: "settlement", method: "scrap_18", purity: 750, weight: 50 }),
    ).toMatchObject({
      weight21: 42.86,
      goldDelta: -42.86,
      cashDelta: 0,
    });
  });

  test("cashback bar reduces both gold and cashback cash", () => {
    expect(
      computeLine({
        ...base,
        kind: "settlement",
        method: "bar_cashback",
        purity: 1000,
        weight: 10,
        rate: 25,
      }),
    ).toEqual({
      weight21: 11.43,
      cashAmount: 250,
      goldDelta: -11.43,
      cashDelta: -250,
    });
  });

  test("workmanship-to-gold clears cash and creates gold owed", () => {
    expect(
      computeLine({
        ...base,
        kind: "settlement",
        method: "wage_to_gold",
        amount: 50000,
        goldPrice: 6250,
      }),
    ).toEqual({
      weight21: 8,
      cashAmount: 50000,
      goldDelta: 8,
      cashDelta: -50000,
    });
  });

  test("merchant transfer reduces both selected ledgers", () => {
    expect(computeLine({ ...base, kind: "transfer", weight: 10, amount: 500 })).toEqual({
      weight21: 10,
      cashAmount: 500,
      goldDelta: -10,
      cashDelta: -500,
    });
  });
});
