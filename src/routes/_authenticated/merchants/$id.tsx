import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PlusCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BalanceValue } from "@/components/balance-value";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  balancesQuery,
  merchantBreakdownQuery,
  merchantQuery,
  merchantTxnsQuery,
} from "@/lib/db";
import { fmtDate, fmtGrams, fmtMoney, KIND_SHORT, PURITIES } from "@/lib/gold-math";

export const Route = createFileRoute("/_authenticated/merchants/$id")({
  head: () => ({
    meta: [
      { title: "كشف حساب تاجر — دفتر الصاغة" },
      { name: "description", content: "رصيد التاجر بالذهب والفلوس وكل الحركات والتسديدات." },
      { property: "og:title", content: "كشف حساب تاجر — دفتر الصاغة" },
      { property: "og:description", content: "رصيد التاجر وكل الحركات والتسديدات." },
    ],
  }),
  component: MerchantPage,
});

function MerchantPage() {
  const { id } = useParams({ from: "/_authenticated/merchants/$id" });
  const { data: merchant } = useQuery(merchantQuery(id));
  const { data: txns = [] } = useQuery(merchantTxnsQuery(id));
  const { data: breakdown = [] } = useQuery(merchantBreakdownQuery(id));
  const { data: balances = [] } = useQuery(balancesQuery);
  const bal = balances.find((b) => b.merchant_id === id);

  return (
    <AppShell title={merchant?.name ?? "كشف حساب"}>
      <Card className="p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold">{merchant?.name ?? "..."}</h2>
            <p className="text-xs font-semibold text-muted-foreground">
              {merchant?.merchant_type === "raw" ? "تاجر خام" : "تاجر مشغولات"}
              {merchant?.phone ? ` · ${merchant.phone}` : ""}
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0 gap-2 font-bold">
            <Link to="/new" search={{ merchant: id }}>
              <PlusCircle className="h-4 w-4" />
              حركة
            </Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-bold text-muted-foreground">رصيد الدهب (عيار 21)</p>
            <BalanceValue value={Number(bal?.gold_21 ?? 0)} unit="gold" />
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-bold text-muted-foreground">رصيد النقدية</p>
            <BalanceValue value={Number(bal?.cash ?? 0)} unit="cash" />
          </div>
        </div>
      </Card>

      {breakdown.length > 0 ? (
        <Card className="mt-3 p-4">
          <h3 className="text-base font-extrabold">تفصيل الأعيرة</h3>
          <div className="mt-3 space-y-2">
            {breakdown.map((row) => (
              <div
                key={row.purity}
                className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2 text-sm font-bold"
              >
                <span>
                  {PURITIES.find((p) => p.value === Number(row.purity))?.label ??
                    `عيار ${row.purity}`}
                </span>
                <span className="tnum">{fmtGrams(Number(row.gold_weight))}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <h3 className="mt-5 text-lg font-extrabold">الحركات</h3>
      <div className="mt-3 space-y-2.5 pb-6">
        {txns.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">مافيش حركات لسه.</Card>
        ) : (
          txns.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold">{KIND_SHORT[t.kind]}</p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {fmtDate(t.txn_date)}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <BalanceValue value={Number(t.total_gold_21)} unit="gold" size="sm" />
                  <div>
                    <BalanceValue value={Number(t.total_cash)} unit="cash" size="sm" />
                  </div>
                </div>
              </div>
              {t.transaction_lines?.length ? (
                <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                  {t.transaction_lines.map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold"
                    >
                      <span className="min-w-0 truncate">{l.label || "بند"}</span>
                      <span className="tnum shrink-0 text-muted-foreground">
                        {Number(l.weight) ? `${fmtGrams(Number(l.weight))} · ` : ""}
                        {Number(l.cash_amount) ? fmtMoney(Number(l.cash_amount)) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}
