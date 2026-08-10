import { createFileRoute, Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpenText, PlusCircle, Ban, Scale } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { BalanceValue } from "@/components/balance-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  merchantActivityTotalsQuery,
  merchantBalanceQuery,
  merchantQuery,
  merchantTxnsInfiniteQuery,
  myRoleQuery,
} from "@/lib/db";
import { fmtDate, fmtGrams, fmtMoney, KIND_SHORT } from "@/lib/gold-math";
import { supabase } from "@/integrations/supabase/client";
import { DateRangePicker } from "@/components/date-range-picker";
import { LoadMore } from "@/components/load-more";
import {
  PageHeaderSkeleton,
  QueryError,
  TransactionRowsSkeleton,
} from "@/components/loading-states";

const searchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/merchants/$id")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "حساب التاجر — Mahaba Gold" }] }),
  component: MerchantPage,
});

function MerchantPage() {
  const { id } = useParams({ from: "/_authenticated/merchants/$id" });
  const search = useSearch({ from: "/_authenticated/merchants/$id" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: merchant, isLoading: merchantLoading } = useQuery(merchantQuery(id));
  const transactions = useInfiniteQuery(merchantTxnsInfiniteQuery(id, search.from, search.to));
  const txns = transactions.data?.pages.flatMap((page) => page.rows) ?? [];
  const { data: bal } = useQuery(merchantBalanceQuery(id));
  const { data: period } = useQuery(merchantActivityTotalsQuery(id, search.from, search.to));
  const { data: me } = useQuery(myRoleQuery);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleReason, setSettleReason] = useState("");

  const voidTxn = useMutation({
    mutationFn: async () => {
      if (!voidId) return;
      const { error } = await supabase.rpc("void_transaction", {
        _transaction_id: voidId,
        _reason: reason,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم إلغاء الحركة وإخفاؤها من الحساب");
      setVoidId(null);
      setReason("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("settle_merchant_account", {
        _merchant_id: id,
        _reason: settleReason.trim(),
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تمت تصفية الحساب وأصبح الرصيد صفرًا");
      setSettleOpen(false);
      setSettleReason("");
      qc.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title={merchant?.name ?? "حساب التاجر"}>
      {merchantLoading ? (
        <PageHeaderSkeleton />
      ) : (
        <div className="border-b border-border pb-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold">{merchant?.name ?? "..."}</h2>
              <p className="text-sm text-muted-foreground">
                {merchant?.merchant_type === "raw" ? "تاجر خام" : "تاجر مشغولات"}
                {merchant?.phone ? ` · ${merchant.phone}` : ""}
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:w-80">
              <Button asChild className="min-w-0 gap-2 font-bold">
                <Link to="/new" search={{ merchant: id }}>
                  <PlusCircle className="h-4 w-4" />
                  حركة
                </Link>
              </Button>
              <Button asChild variant="outline" className="min-w-0 gap-2 font-bold">
                <Link to="/statements" search={{ merchant: id }}>
                  <BookOpenText className="h-4 w-4" />
                  كشف الحساب
                </Link>
              </Button>
              {me?.isAdmin ? (
                <Button
                  variant="destructive"
                  className="col-span-2 gap-2 font-bold"
                  onClick={() => setSettleOpen(true)}
                >
                  <Scale className="h-4 w-4" />
                  تصفية الحساب
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 divide-x divide-x-reverse divide-border rounded-xl bg-card py-4 shadow-sm ring-1 ring-border/60">
            <div className="px-4">
              <p className="text-xs font-bold text-muted-foreground">رصيد الدهب · عيار 21</p>
              <BalanceValue value={Number(bal?.gold_21 ?? 0)} unit="gold" />
            </div>
            <div className="px-4">
              <p className="text-xs font-bold text-muted-foreground">رصيد النقدية</p>
              <BalanceValue value={Number(bal?.cash ?? 0)} unit="cash" />
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,25rem)_1fr] sm:items-center">
        <DateRangePicker
          value={search}
          onCommit={(range) =>
            navigate({ to: "/merchants/$id", params: { id }, search: range, replace: true })
          }
          onClear={() =>
            navigate({ to: "/merchants/$id", params: { id }, search: {}, replace: true })
          }
        />
        <div className="text-start text-xs text-muted-foreground sm:text-end">
          <span>حركة الفترة: </span>
          <strong className="tnum text-foreground">
            {fmtGrams(Number(period?.gold ?? 0))} · {fmtMoney(Number(period?.cash ?? 0))}
          </strong>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border pb-6">
        {transactions.isLoading ? (
          <TransactionRowsSkeleton />
        ) : transactions.isError ? (
          <QueryError onRetry={() => transactions.refetch()} />
        ) : (
          txns.map((t) => {
            const other = t.merchant_id === id ? t.counterparty?.name : t.merchant?.name;
            return (
              <div key={t.id} className="group py-4">
                <div className="flex items-start justify-between gap-3">
                  <Link
                    to="/transactions/$id/edit"
                    params={{ id: t.id }}
                    className="min-w-0 flex-1"
                  >
                    <p className="font-extrabold group-hover:text-primary">
                      {t.is_account_settlement ? "تصفية الحساب" : KIND_SHORT[t.kind]}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <bdi dir="ltr">{fmtDate(t.txn_date)}</bdi>
                      {other ? ` · ${other}` : ""}
                      {t.notes ? ` · ${t.notes}` : ""}
                    </p>
                  </Link>
                  <div className="shrink-0 text-end">
                    <BalanceValue value={Number(t.total_gold_21)} unit="gold" size="sm" />
                    <div>
                      <BalanceValue value={Number(t.total_cash)} unit="cash" size="sm" />
                    </div>
                  </div>
                </div>
                {t.transaction_lines?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {t.transaction_lines.map((l) => (
                      <span
                        key={l.id}
                        className="rounded-md bg-muted px-2 py-1 text-xs font-semibold"
                      >
                        {l.is_return ? "مرتجع" : KIND_SHORT[l.kind]}
                        {l.label ? ` · ${l.label}` : ""}
                        {Number(l.weight) ? ` · ${fmtGrams(Number(l.weight))}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
                {me?.isAdmin ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-8 gap-1 px-2 text-xs text-destructive"
                    onClick={() => setVoidId(t.id)}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    إلغاء الحركة
                  </Button>
                ) : null}
              </div>
            );
          })
        )}
        {transactions.isFetchingNextPage ? <TransactionRowsSkeleton count={2} /> : null}
        {!transactions.isLoading && txns.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground">مافيش حركات في الفترة دي.</div>
        ) : null}
      </div>
      <LoadMore
        hasMore={Boolean(transactions.hasNextPage)}
        loading={transactions.isFetchingNextPage}
        onClick={() => transactions.fetchNextPage()}
      />

      <Dialog open={Boolean(voidId)} onOpenChange={(open) => !open && setVoidId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-start">إلغاء الحركة</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            الحركة مش هتأثر على الأرصدة ومش هتظهر في حساب التاجر أو كشف الحساب، لكن الإلغاء وسببه
            هيفضلوا ظاهرين في سجل النشاط.
          </p>
          <div className="space-y-1.5">
            <Label>سبب الإلغاء</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: الحركة اتسجلت مرتين"
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => voidTxn.mutate()}
              disabled={voidTxn.isPending || reason.trim().length < 3}
            >
              تأكيد الإلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-start">تصفية حساب {merchant?.name}</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            هتتسجل حركة موازنة تقفل رصيد الذهب والنقدية على صفر، وتفضل موجودة في كشف الحساب.
          </p>
          <div className="rounded-xl bg-muted p-3 text-sm font-bold">
            الرصيد الحالي: {fmtGrams(Number(bal?.gold_21 ?? 0))} ·{" "}
            {fmtMoney(Number(bal?.cash ?? 0))}
          </div>
          <div className="space-y-1.5">
            <Label>سبب التصفية</Label>
            <Textarea
              value={settleReason}
              onChange={(event) => setSettleReason(event.target.value)}
              placeholder="مثال: مراجعة وإقفال الحساب"
            />
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => settle.mutate()}
              disabled={settle.isPending || settleReason.trim().length < 3}
            >
              تأكيد التصفية
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
