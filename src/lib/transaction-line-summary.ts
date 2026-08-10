import {
  fmtGrams,
  fmtMoney,
  KIND_SHORT,
  METHOD_LABELS,
  PURITIES,
  type PayMethod,
  type TxnKind,
} from "@/lib/gold-math";

export function transactionLineSummary({
  index,
  kind,
  isReturn,
  method,
  categoryName,
  purity,
  weight,
  weight21,
  cashAmount,
}: {
  index: number;
  kind: TxnKind;
  isReturn: boolean;
  method: PayMethod | null;
  categoryName?: string | undefined;
  purity: number;
  weight: number;
  weight21: number;
  cashAmount: number;
}) {
  const title = `بند ${index + 1} · ${isReturn ? "مرتجع" : KIND_SHORT[kind]}`;
  const specific =
    kind === "settlement" && method
      ? METHOD_LABELS[method]
      : kind === "transfer"
        ? METHOD_LABELS.transfer
        : categoryName || (purity === 991 ? "بندقي" : "لم يتم اختيار الصنف");
  const purityText =
    PURITIES.find((candidate) => candidate.value === purity)?.label ?? `عيار ${purity}`;
  const meta: string[] = [purityText];
  if (weight > 0) meta.push(fmtGrams(weight));
  if (weight > 0 && Math.abs(weight21 - weight) >= 0.005) {
    meta.push(`يعادل ${fmtGrams(weight21)} عيار 21`);
  }
  if (cashAmount) meta.push(fmtMoney(cashAmount));
  return { title, specific, meta: meta.join(" · ") };
}
