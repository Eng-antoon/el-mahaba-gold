import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import {
  merchantsQuery,
  statementBalancesQuery,
  statementInfiniteQuery,
  statementSummaryQuery,
} from "@/lib/db";
import { fmtDate, fmtGrams, fmtMoney, KIND_SHORT } from "@/lib/gold-math";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { DateRangePicker } from "@/components/date-range-picker";
import { LoadMore } from "@/components/load-more";
import { QueryError, TransactionRowsSkeleton } from "@/components/loading-states";

const searchSchema = z.object({
  merchant: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/statements")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "كشف حساب تاجر — Mahaba Gold" }] }),
  component: StatementsPage,
});

function StatementsPage() {
  const search = useSearch({ from: "/_authenticated/statements" });
  const navigate = useNavigate();
  const { data: merchants = [] } = useQuery(merchantsQuery);
  const statement = useInfiniteQuery(
    statementInfiniteQuery(search.merchant ?? null, search.from, search.to),
  );
  const rows = statement.data?.pages.flatMap((page) => page.rows) ?? [];
  const { data: balances } = useQuery(
    statementBalancesQuery(search.merchant ?? null, search.from, search.to),
  );
  const { data: summary } = useQuery(
    statementSummaryQuery(search.merchant ?? null, search.from, search.to),
  );
  function setRange(from?: string, to?: string) {
    navigate({ to: "/statements", search: { ...search, from, to }, replace: true });
  }

  return (
    <AppShell title="كشف الحساب">
      <div className="border-b border-border pb-5">
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label className="font-bold">التاجر</Label>
            <Select
              {...(search.merchant ? { value: search.merchant } : {})}
              onValueChange={(merchant) =>
                navigate({ to: "/statements", search: { merchant }, replace: true })
              }
            >
              <SelectTrigger className="h-12 bg-card text-base">
                <SelectValue placeholder="اختار التاجر" />
              </SelectTrigger>
              <SelectContent>
                {merchants.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {m.merchant_type === "raw" ? "خام" : "مشغولات"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {search.merchant ? (
          <DateRangePicker
            className="mt-4 max-w-md"
            value={search}
            onCommit={(range) => setRange(range.from, range.to)}
            onClear={() => setRange()}
          />
        ) : null}
      </div>

      {!search.merchant ? (
        <div className="py-16 text-center text-muted-foreground">
          اختار تاجر علشان يظهر كشف الحساب.
        </div>
      ) : statement.isLoading ? (
        <TransactionRowsSkeleton count={6} />
      ) : statement.isError ? (
        <QueryError onRetry={() => statement.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border border-b border-border py-5">
            <StatementTotal
              title="رصيد أول المدة"
              gold={Number(balances?.opening_gold ?? 0)}
              cash={Number(balances?.opening_cash ?? 0)}
            />
            <StatementTotal
              title="حركة المدة"
              gold={Number(balances?.period_gold ?? 0)}
              cash={Number(balances?.period_cash ?? 0)}
            />
            <StatementTotal
              title="رصيد آخر المدة"
              gold={Number(balances?.closing_gold ?? 0)}
              cash={Number(balances?.closing_cash ?? 0)}
            />
          </div>

          <Card className="mt-5 space-y-4 p-4">
            <div>
              <h3 className="font-extrabold">ملخص المطابقة</h3>
              <p className="text-xs text-muted-foreground">كل أوزان المقارنة مكافئ عيار 21</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SummaryValue
                label="إجمالي السبايك المستلمة"
                value={fmtGrams(Number(summary?.total_bullion_received_21 ?? 0))}
              />
              <SummaryValue
                label="إجمالي المشغولات المستلمة"
                value={fmtGrams(Number(summary?.total_jewelry_received_21 ?? 0))}
              />
              <SummaryValue
                label="إجمالي النقدية المدفوعة"
                value={fmtMoney(Number(summary?.total_cash_paid ?? 0))}
              />
              <SummaryValue
                label="إجمالي النقدية المحصلة"
                value={fmtMoney(Number(summary?.total_cash_received ?? 0))}
              />
              <SummaryValue
                label="إجمالي الكسر المدفوع"
                value={fmtGrams(Number(summary?.total_scrap_paid_21 ?? 0))}
              />
            </div>
            <div className="grid gap-2 border-t border-border pt-3 text-sm sm:grid-cols-2">
              <Comparison
                label="النقدية المدفوعة مقابل المحصلة"
                first={fmtMoney(Number(summary?.total_cash_paid ?? 0))}
                second={fmtMoney(Number(summary?.total_cash_received ?? 0))}
              />
              <Comparison
                label="السبائك مقابل المشغولات"
                first={fmtGrams(Number(summary?.total_bullion_received_21 ?? 0))}
                second={fmtGrams(Number(summary?.total_jewelry_received_21 ?? 0))}
              />
            </div>
          </Card>

          <div className="mt-5 hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-start">التاريخ والحركة</th>
                  <th className="p-3 text-end">حركة الدهب</th>
                  <th className="p-3 text-end">حركة الفلوس</th>
                  <th className="p-3 text-end">الرصيد الجاري</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.transaction_id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <Link
                        to="/transactions/$id/edit"
                        params={{ id: r.transaction_id }}
                        className="font-bold hover:text-primary"
                      >
                        {statementKindLabel(r)}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        <bdi dir="ltr">{fmtDate(r.txn_date)}</bdi>
                        {r.counterparty_name ? ` · ${r.counterparty_name}` : ""}
                      </div>
                    </td>
                    <td className="tnum p-3 text-end">
                      <Signed value={Number(r.gold_delta)} unit="gold" />
                    </td>
                    <td className="tnum p-3 text-end">
                      <Signed value={Number(r.cash_delta)} unit="cash" />
                    </td>
                    <td className="tnum p-3 text-end font-bold">
                      <div>{fmtGrams(Number(r.running_gold))}</div>
                      <div>{fmtMoney(Number(r.running_cash))}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 divide-y divide-border md:hidden">
            {rows.map((r) => (
              <Link
                key={r.transaction_id}
                to="/transactions/$id/edit"
                params={{ id: r.transaction_id }}
                className="block py-4"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{statementKindLabel(r)}</p>
                    <p className="text-xs text-muted-foreground">
                      <bdi dir="ltr">{fmtDate(r.txn_date)}</bdi>
                      {r.counterparty_name ? ` · ${r.counterparty_name}` : ""}
                    </p>
                  </div>
                  <div className="text-end text-sm">
                    <Signed value={Number(r.gold_delta)} unit="gold" />
                    <div>
                      <Signed value={Number(r.cash_delta)} unit="cash" />
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs">
                  <span>الرصيد بعد الحركة</span>
                  <span className="tnum font-bold">
                    {fmtGrams(Number(r.running_gold))} · {fmtMoney(Number(r.running_cash))}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {statement.isFetchingNextPage ? <TransactionRowsSkeleton count={2} /> : null}
          {rows.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">مافيش حركات في الفترة دي.</div>
          ) : null}
          <LoadMore
            hasMore={Boolean(statement.hasNextPage)}
            loading={statement.isFetchingNextPage}
            onClick={() => statement.fetchNextPage()}
          />
        </>
      )}
    </AppShell>
  );
}

function statementKindLabel(row: {
  kind: keyof typeof KIND_SHORT;
  has_returns: boolean;
  is_account_settlement: boolean;
  line_kinds: unknown[];
}) {
  if (row.is_account_settlement) return "تصفية الحساب";
  if (row.kind === "mixed") return KIND_SHORT.mixed;
  if (row.has_returns && row.line_kinds.length === 1) return "مرتجع";
  return KIND_SHORT[row.kind];
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 p-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="tnum mt-1 font-extrabold">{value}</p>
    </div>
  );
}

function Comparison({ label, first, second }: { label: string; first: string; second: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <span className="font-bold text-muted-foreground">{label}</span>
      <span className="tnum shrink-0 font-extrabold">
        {first} / {second}
      </span>
    </div>
  );
}

function StatementTotal({ title, gold, cash }: { title: string; gold: number; cash: number }) {
  return (
    <div className="min-w-0 px-2 text-center sm:px-4">
      <p className="text-[11px] font-bold text-muted-foreground sm:text-sm">{title}</p>
      <p className="tnum mt-2 truncate text-sm font-extrabold sm:text-lg">{fmtGrams(gold)}</p>
      <p className="tnum truncate text-xs font-bold sm:text-base">{fmtMoney(cash)}</p>
    </div>
  );
}

function Signed({ value, unit }: { value: number; unit: "gold" | "cash" }) {
  const text = unit === "gold" ? fmtGrams(value) : fmtMoney(value);
  if (Math.abs(value) < 0.005) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={value > 0 ? "text-owed" : "text-credit"}>
      {value > 0 ? "+" : "−"}
      {text}
    </span>
  );
}
