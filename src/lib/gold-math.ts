import { formatArabicDate, formatArabicDateTime } from "@/lib/date-format";

// منطق حسابات الذهب — نقاء العيارات والتحويل لعيار 21
// كل الأرصدة بالإشارة: موجب = عليّ (أنا مدين للتاجر) ، سالب = ليّ (التاجر مدين لي)

export const BASE_PURITY = 875; // عيار 21

export const PURITIES = [
  { value: 1000, label: "عيار 24" },
  { value: 991, label: "بندقي 991" },
  { value: 875, label: "عيار 21" },
  { value: 830, label: "عيار 830" },
  { value: 750, label: "عيار 18" },
] as const;

/** تحويل أي وزن بأي عيار إلى ما يعادله عيار 21 */
export function toGold21(weight: number, purity: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(purity)) return 0;
  return round2((weight * purity) / BASE_PURITY);
}

/** تحويل وزن عيار 21 إلى ما يعادله في عيار آخر */
export function fromGold21(weight21: number, purity: number): number {
  if (!purity) return 0;
  return round2((weight21 * BASE_PURITY) / purity);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** الثابت المضاف على البندقي والسبيكة ذات العيار المختلف (جنيه للجرام) */
export const OTHER_PURITY_FEE = 8;

export type MerchantType = "jewelry" | "raw";
export type TxnKind = "inbound" | "settlement" | "purchase" | "sale" | "transfer";
export type DocumentTxnKind = TxnKind | "mixed";
export type PayMethod =
  | "cash"
  | "cash_received"
  | "scrap_21"
  | "scrap_18"
  | "bar_cashback"
  | "bar_other_purity"
  | "bandaqi"
  | "wage_to_gold"
  | "transfer";

export const KIND_LABELS: Record<DocumentTxnKind, string> = {
  inbound: "وارد (شغل داخل)",
  settlement: "تسديد",
  purchase: "شراء دهب",
  sale: "بيع دهب",
  transfer: "تحويل لتاجر آخر",
  mixed: "حركة متنوعة",
};

export const KIND_SHORT: Record<DocumentTxnKind, string> = {
  inbound: "وارد",
  settlement: "تسديد",
  purchase: "شراء",
  sale: "بيع",
  transfer: "تحويل",
  mixed: "حركة متنوعة",
};

export const METHOD_LABELS: Record<PayMethod, string> = {
  cash: "نقدية (فلوس)",
  cash_received: "تحصيل نقدية",
  scrap_21: "كسر عيار 21",
  scrap_18: "كسر عيار 18",
  bar_cashback: "سبيكة كاشباك",
  bar_other_purity: "سبيكة عيار مختلف",
  bandaqi: "بندقي",
  wage_to_gold: "أوجر إلى دهب",
  transfer: "تحويل من حساب تاجر",
};

export const KINDS_BY_TYPE: Record<MerchantType, TxnKind[]> = {
  jewelry: ["inbound", "purchase", "settlement", "transfer"],
  raw: ["inbound", "purchase", "sale", "settlement", "transfer"],
};

export const METHODS_BY_TYPE: Record<MerchantType, PayMethod[]> = {
  jewelry: [
    "cash",
    "cash_received",
    "scrap_21",
    "scrap_18",
    "bar_cashback",
    "bar_other_purity",
    "bandaqi",
    "wage_to_gold",
  ],
  raw: ["cash", "cash_received", "bandaqi", "bar_other_purity", "bar_cashback", "wage_to_gold"],
};

/** المدخلات المطلوبة لكل طريقة تسديد */
export interface MethodShape {
  weight: boolean;
  purity: "fixed" | "choose" | "free" | "none";
  fixedPurity?: number;
  rateLabel?: string;
  amount: boolean;
  needsPrice?: boolean;
}

export function methodShape(method: PayMethod): MethodShape {
  switch (method) {
    case "cash":
    case "cash_received":
      return { weight: false, purity: "none", amount: true };
    case "scrap_21":
      return { weight: true, purity: "fixed", fixedPurity: 875, amount: false };
    case "scrap_18":
      return { weight: true, purity: "fixed", fixedPurity: 750, amount: false };
    case "bar_cashback":
      return {
        weight: true,
        purity: "choose",
        fixedPurity: 1000,
        amount: true,
      };
    case "bar_other_purity":
      return { weight: true, purity: "free", fixedPurity: 830, amount: false };
    case "bandaqi":
      return { weight: true, purity: "fixed", fixedPurity: 991, amount: false };
    case "wage_to_gold":
      return { weight: false, purity: "none", amount: true, needsPrice: true };
    case "transfer":
      return { weight: true, purity: "fixed", fixedPurity: 875, amount: false };
  }
}

export interface LineInput {
  kind: TxnKind;
  method?: PayMethod | null;
  purity: number;
  weight: number;
  pieces?: number | null;
  /** المصنعية أو الكاشباك للجرام */
  rate: number;
  /** مبلغ نقدي مباشر */
  amount: number;
  /** سعر جرام عيار 21 */
  goldPrice: number;
  isReturn?: boolean;
}

export interface LineResult {
  weight21: number;
  cashAmount: number;
  goldDelta: number;
  cashDelta: number;
}

/**
 * حساب أثر البند على رصيد التاجر.
 * موجب = عليّ ، سالب = ليّ
 */
export function computeLine(input: LineInput): LineResult {
  const w21 = toGold21(input.weight || 0, input.purity || 0);

  if (input.kind === "inbound") {
    // شغل داخل: الدهب عليّ + المصنعية عليّ
    const cash = round2((input.weight || 0) * (input.rate || 0));
    const direction = input.isReturn ? -1 : 1;
    return {
      weight21: w21,
      cashAmount: cash,
      goldDelta: round2(direction * w21),
      cashDelta: round2(direction * cash),
    };
  }

  if (input.kind === "purchase") {
    // شراء دهب: الدهب ليّ + ثمنه عليّ
    const price = round2(
      (input.weight || 0) * (input.goldPrice || 0) + (input.weight || 0) * (input.rate || 0),
    );
    return { weight21: w21, cashAmount: price, goldDelta: -w21, cashDelta: price };
  }

  if (input.kind === "sale") {
    // بيع دهب: الدهب عليّ + الفلوس ليّ
    const price = round2(
      (input.weight || 0) * (input.goldPrice || 0) + (input.weight || 0) * (input.rate || 0),
    );
    return { weight21: w21, cashAmount: price, goldDelta: w21, cashDelta: -price };
  }

  if (input.kind === "transfer") {
    // التاجر الأول سدّد للتاجر الثاني بالنيابة عن المحل: الدين ينقص عند الاثنين.
    const weight = round2(input.weight || 0);
    const cash = round2(input.amount || 0);
    return { weight21: weight, cashAmount: cash, goldDelta: -weight, cashDelta: -cash };
  }

  // تسديد
  const method = input.method ?? "cash";
  switch (method) {
    case "cash": {
      const amt = round2(input.amount || 0);
      return { weight21: 0, cashAmount: amt, goldDelta: 0, cashDelta: -amt };
    }
    case "cash_received": {
      const amt = round2(input.amount || 0);
      return { weight21: 0, cashAmount: amt, goldDelta: 0, cashDelta: amt };
    }
    case "scrap_21":
    case "scrap_18":
      return { weight21: w21, cashAmount: 0, goldDelta: -w21, cashDelta: 0 };
    case "bar_cashback": {
      const cashback = round2(input.amount || 0);
      return { weight21: w21, cashAmount: cashback, goldDelta: -w21, cashDelta: -cashback };
    }
    case "bar_other_purity":
    case "bandaqi": {
      const fee = round2((input.weight || 0) * OTHER_PURITY_FEE);
      return { weight21: w21, cashAmount: fee, goldDelta: -w21, cashDelta: -fee };
    }
    case "wage_to_gold": {
      const amt = round2(input.amount || 0);
      const price = input.goldPrice || 0;
      const gold = price > 0 ? round2(amt / price) : 0;
      return { weight21: gold, cashAmount: amt, goldDelta: gold, cashDelta: -amt };
    }
    default:
      return { weight21: 0, cashAmount: 0, goldDelta: 0, cashDelta: 0 };
  }
}

// ===== التنسيق =====

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("ar-EG", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    numberingSystem: "latn",
  });

export function fmtGrams(n: number): string {
  return nf(2, 2).format(Math.abs(n)) + " جم";
}

export function fmtMoney(n: number): string {
  return nf(0, 2).format(Math.abs(n)) + " ج";
}

export function fmtNum(n: number, dp = 2): string {
  return nf(0, dp).format(n);
}

/** نص الاتجاه: موجب = عليّ ، سالب = ليّ */
export function directionLabel(n: number): "عليّ" | "ليّ" | "متساوي" {
  if (Math.abs(n) < 0.005) return "متساوي";
  return n > 0 ? "عليّ" : "ليّ";
}

export function fmtDate(d: string | Date): string {
  return formatArabicDate(d);
}

export function fmtDateTime(d: string | Date): string {
  return formatArabicDateTime(d);
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
