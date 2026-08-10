import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PlusCircle, Search, BookOpenText } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { BalanceValue } from "@/components/balance-value";
import { balanceSummaryQuery, merchantDirectoryInfiniteQuery } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { fmtDate, fmtNum } from "@/lib/gold-math";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MerchantRowsSkeleton, QueryError } from "@/components/loading-states";
import { LoadMore } from "@/components/load-more";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "الرئيسية — Mahaba Gold" },
      { name: "description", content: "إجمالي الذهب والنقدية اللي ليك واللي عليك من كل التجار." },
      { property: "og:title", content: "الرئيسية — Mahaba Gold" },
      { property: "og:description", content: "إجمالي الذهب والنقدية مع كل التجار في شاشة واحدة." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [q, setQ] = useState("");
  const search = useDebouncedValue(q.trim());
  const { data: totals, isLoading: summaryLoading } = useQuery(balanceSummaryQuery);
  const directory = useInfiniteQuery(merchantDirectoryInfiniteQuery({ search, sort: "exposure" }));
  const rows = directory.data?.pages.flatMap((page) => page.rows) ?? [];

  return (
    <AppShell title="الرئيسية">
      <div className="grid gap-3 sm:grid-cols-2">
        {summaryLoading ? (
          <>
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </>
        ) : (
          <>
            <SummaryCard
              title="الدهب"
              unit="جم عيار 21"
              owed={Number(totals?.gold_owed ?? 0)}
              credit={Number(totals?.gold_credit ?? 0)}
            />
            <SummaryCard
              title="النقدية"
              unit="جنيه"
              owed={Number(totals?.cash_owed ?? 0)}
              credit={Number(totals?.cash_credit ?? 0)}
            />
          </>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">أرصدة التجار</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="gap-2 font-bold">
            <Link to="/statements">
              <BookOpenText className="h-4 w-4" />
              كشف حساب
            </Link>
          </Button>
          <Button asChild className="gap-2 font-bold">
            <Link to="/new">
              <PlusCircle className="h-4 w-4" />
              حركة جديدة
            </Link>
          </Button>
        </div>
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
        {directory.isLoading ? (
          <MerchantRowsSkeleton />
        ) : directory.isError ? (
          <QueryError onRetry={() => directory.refetch()} />
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">مافيش تجار لسه.</p>
            <Button asChild className="mt-4 font-bold">
              <Link to="/merchants">أضف تاجر</Link>
            </Button>
          </Card>
        ) : (
          rows.map((b) => (
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
                    {b.last_txn_date ? (
                      <>
                        {" · آخر حركة "}
                        <bdi dir="ltr">{fmtDate(b.last_txn_date)}</bdi>
                      </>
                    ) : null}
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
        {directory.isFetchingNextPage ? <MerchantRowsSkeleton count={2} /> : null}
      </div>
      <LoadMore
        hasMore={Boolean(directory.hasNextPage)}
        loading={directory.isFetchingNextPage}
        onClick={() => directory.fetchNextPage()}
      />
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
