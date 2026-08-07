import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PlusCircle, Search, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BalanceValue } from "@/components/balance-value";
import { balancesQuery, latestPriceQuery } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/gold-math";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "الرئيسية — دفتر الصاغة" },
      { name: "description", content: "إجمالي الذهب والنقدية اللي ليك واللي عليك من كل التجار." },
      { property: "og:title", content: "الرئيسية — دفتر الصاغة" },
      { property: "og:description", content: "إجمالي الذهب والنقدية مع كل التجار في شاشة واحدة." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: balances = [], isLoading } = useQuery(balancesQuery);
  const { data: price } = useQuery(latestPriceQuery);
  const [q, setQ] = useState("");

  const totals = useMemo(() => {
    let goldOwed = 0,
      goldCredit = 0,
      cashOwed = 0,
      cashCredit = 0;
    for (const b of balances) {
      const g = Number(b.gold_21) || 0;
      const c = Number(b.cash) || 0;
      if (g > 0) goldOwed += g;
      else goldCredit += -g;
      if (c > 0) cashOwed += c;
      else cashCredit += -c;
    }
    return { goldOwed, goldCredit, cashOwed, cashCredit };
  }, [balances]);

  const filtered = useMemo(() => {
    const term = q.trim();
    const list = term ? balances.filter((b) => b.name.includes(term)) : balances;
    return [...list].sort(
      (a, b) => Math.abs(Number(b.gold_21)) - Math.abs(Number(a.gold_21)),
    );
  }, [balances, q]);

  return (
    <AppShell title="الرئيسية">
      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryCard
          title="الدهب"
          unit="جم عيار 21"
          owed={totals.goldOwed}
          credit={totals.goldCredit}
        />
        <SummaryCard title="النقدية" unit="جنيه" owed={totals.cashOwed} credit={totals.cashCredit} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <TrendingUp className="h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">سعر جرام عيار 21</p>
          <p className="tnum text-lg font-extrabold">
            {price ? fmtMoney(Number(price.price_per_gram_21)) : "مش مسجّل"}
            {price ? (
              <span className="ms-2 text-xs font-semibold text-muted-foreground">
                {fmtDate(price.price_date)}
              </span>
            ) : null}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="font-bold">
          <Link to="/prices">تحديث السعر</Link>
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">أرصدة التجار</h2>
        <Button asChild className="gap-2 font-bold">
          <Link to="/new">
            <PlusCircle className="h-4 w-4" />
            حركة جديدة
          </Link>
        </Button>
      </div>

      <div className="relative mt-3">
        <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم التاجر"
          className="h-12 pe-10 text-base"
        />
      </div>

      <div className="mt-3 space-y-2.5">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">جاري التحميل...</p>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">مافيش تجار لسه.</p>
            <Button asChild className="mt-4 font-bold">
              <Link to="/merchants">أضف تاجر</Link>
            </Button>
          </Card>
        ) : (
          filtered.map((b) => (
            <Link
              key={b.merchant_id}
              to="/merchants/$id"
              params={{ id: b.merchant_id }}
              className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/25"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold">{b.name}</p>
                  <p className="text-xs font-semibold text-muted-foreground">
                    {b.merchant_type === "raw" ? "تاجر خام" : "تاجر مشغولات"}
                    {b.last_txn_date ? ` · آخر حركة ${fmtDate(b.last_txn_date)}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-end">
                  <BalanceValue value={Number(b.gold_21)} unit="gold" size="sm" />
                  <div>
                    <BalanceValue value={Number(b.cash)} unit="cash" size="sm" />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </AppShell>
  );
}

function SummaryCard({
  title,
  unit,
  owed,
  credit,
}: {
  title: string;
  unit: string;
  owed: number;
  credit: number;
}) {
  const net = owed - credit;
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-extrabold">{title}</h3>
        <span className="text-xs font-semibold text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-owed-soft p-3">
          <p className="text-xs font-bold text-owed/80">عليّ</p>
          <p className="tnum mt-1 text-xl font-extrabold text-owed">{fmtNum(owed)}</p>
        </div>
        <div className="rounded-xl bg-credit-soft p-3">
          <p className="text-xs font-bold text-credit/80">ليّ</p>
          <p className="tnum mt-1 text-xl font-extrabold text-credit">{fmtNum(credit)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm font-bold text-muted-foreground">الصافي</span>
        <BalanceValue value={net} unit={title === "الدهب" ? "gold" : "cash"} />
      </div>
    </Card>
  );
}
