import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { merchantsQuery, statementQuery } from "@/lib/db";
import { fmtDate, fmtGrams, fmtMoney, KIND_SHORT, todayISO } from "@/lib/gold-math";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link } from "@tanstack/react-router";

const searchSchema = z.object({
  merchant: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/statements")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "كشف حساب تاجر — المحبة للذهب" }] }),
  component: StatementsPage,
});

function StatementsPage() {
  const search = useSearch({ from: "/_authenticated/statements" });
  const navigate = useNavigate();
  const { data: merchants = [] } = useQuery(merchantsQuery);
  const { data: allRows = [], isLoading } = useQuery(statementQuery(search.merchant ?? null));
  const merchant = merchants.find((m) => m.id === search.merchant);

  const view = useMemo(() => {
    const before = allRows.filter((r) => search.from && r.txn_date < search.from);
    const openingGold = before.length ? Number(before.at(-1)?.running_gold ?? 0) : 0;
    const openingCash = before.length ? Number(before.at(-1)?.running_cash ?? 0) : 0;
    let gold = openingGold;
    let cash = openingCash;
    const rows = allRows
      .filter(
        (r) =>
          (!search.from || r.txn_date >= search.from) && (!search.to || r.txn_date <= search.to),
      )
      .map((r) => {
        gold += Number(r.gold_delta);
        cash += Number(r.cash_delta);
        return { ...r, period_running_gold: gold, period_running_cash: cash };
      });
    return { rows, openingGold, openingCash, closingGold: gold, closingCash: cash };
  }, [allRows, search.from, search.to]);

  function setRange(from?: string, to?: string) {
    navigate({ to: "/statements", search: { ...search, from, to }, replace: true });
  }

  function currentMonth() {
    const today = todayISO();
    setRange(`${today.slice(0, 7)}-01`, today);
  }

  return (
    <AppShell title="كشف الحساب">
      <div className="border-b border-border pb-5">
        <div className="grid gap-4 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant={!search.from && !search.to ? "default" : "outline"}
              onClick={() => setRange()}
            >
              الكل
            </Button>
            <Button variant="outline" onClick={() => setRange(todayISO(), todayISO())}>
              النهارده
            </Button>
            <Button variant="outline" onClick={currentMonth}>
              الشهر ده
            </Button>
          </div>
        </div>
        {search.merchant ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:max-w-lg">
            <div className="space-y-1.5">
              <Label>من</Label>
              <Input
                dir="ltr"
                type="date"
                value={search.from ?? ""}
                onChange={(e) => setRange(e.target.value || undefined, search.to)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>إلى</Label>
              <Input
                dir="ltr"
                type="date"
                value={search.to ?? ""}
                onChange={(e) => setRange(search.from, e.target.value || undefined)}
              />
            </div>
          </div>
        ) : null}
      </div>

      {!search.merchant ? (
        <div className="py-16 text-center text-muted-foreground">
          اختار تاجر علشان يظهر كشف الحساب.
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center text-muted-foreground">جاري تحميل الحساب...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border border-b border-border py-5">
            <StatementTotal
              title="رصيد أول المدة"
              gold={view.openingGold}
              cash={view.openingCash}
            />
            <StatementTotal
              title="حركة المدة"
              gold={view.closingGold - view.openingGold}
              cash={view.closingCash - view.openingCash}
            />
            <StatementTotal
              title="رصيد آخر المدة"
              gold={view.closingGold}
              cash={view.closingCash}
            />
          </div>

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
                {view.rows.map((r) => (
                  <tr key={r.transaction_id} className="hover:bg-muted/30">
                    <td className="p-3">
                      <Link
                        to="/transactions/$id/edit"
                        params={{ id: r.transaction_id }}
                        className="font-bold hover:text-primary"
                      >
                        {KIND_SHORT[r.kind]}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(r.txn_date)}
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
                      <div>{fmtGrams(r.period_running_gold)}</div>
                      <div>{fmtMoney(r.period_running_cash)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 divide-y divide-border md:hidden">
            {view.rows.map((r) => (
              <Link
                key={r.transaction_id}
                to="/transactions/$id/edit"
                params={{ id: r.transaction_id }}
                className="block py-4"
              >
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-extrabold">{KIND_SHORT[r.kind]}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(r.txn_date)}
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
                    {fmtGrams(r.period_running_gold)} · {fmtMoney(r.period_running_cash)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {view.rows.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground">مافيش حركات في الفترة دي.</div>
          ) : null}
        </>
      )}
    </AppShell>
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
