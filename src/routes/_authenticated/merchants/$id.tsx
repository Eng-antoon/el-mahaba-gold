import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BookOpenText, PlusCircle, Ban } from "lucide-react";
import { toast } from "sonner";
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
import { balancesQuery, merchantQuery, merchantTxnsQuery, myRoleQuery } from "@/lib/db";
import { fmtDate, fmtGrams, fmtMoney, KIND_SHORT } from "@/lib/gold-math";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/merchants/$id")({
  head: () => ({ meta: [{ title: "حساب التاجر — المحبة للذهب" }] }),
  component: MerchantPage,
});

function MerchantPage() {
  const { id } = useParams({ from: "/_authenticated/merchants/$id" });
  const qc = useQueryClient();
  const { data: merchant } = useQuery(merchantQuery(id));
  const { data: txns = [] } = useQuery(merchantTxnsQuery(id));
  const { data: balances = [] } = useQuery(balancesQuery);
  const { data: me } = useQuery(myRoleQuery);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [voidId, setVoidId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const bal = balances.find((b) => b.merchant_id === id);

  const filtered = useMemo(
    () => txns.filter((t) => (!from || t.txn_date >= from) && (!to || t.txn_date <= to)),
    [txns, from, to],
  );
  const period = useMemo(
    () =>
      filtered.reduce(
        (a, t) => ({ gold: a.gold + Number(t.total_gold_21), cash: a.cash + Number(t.total_cash) }),
        { gold: 0, cash: 0 },
      ),
    [filtered],
  );

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
      toast.success("تم إلغاء الحركة وحفظها في السجل");
      setVoidId(null);
      setReason("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title={merchant?.name ?? "حساب التاجر"}>
      <div className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold">{merchant?.name ?? "..."}</h2>
            <p className="text-sm text-muted-foreground">
              {merchant?.merchant_type === "raw" ? "تاجر خام" : "تاجر مشغولات"}
              {merchant?.phone ? ` · ${merchant.phone}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="gap-2 font-bold">
              <Link to="/statements" search={{ merchant: id }}>
                <BookOpenText className="h-4 w-4" />
                كشف الحساب
              </Link>
            </Button>
            <Button asChild className="gap-2 font-bold">
              <Link to="/new" search={{ merchant: id }}>
                <PlusCircle className="h-4 w-4" />
                حركة
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 divide-x divide-x-reverse divide-border rounded-xl bg-card py-4">
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

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">من</Label>
          <Input
            type="date"
            dir="ltr"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">إلى</Label>
          <Input
            type="date"
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 w-40"
          />
        </div>
        {from || to ? (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
          >
            مسح الفترة
          </Button>
        ) : null}
        <div className="ms-auto text-end text-xs text-muted-foreground">
          <span>حركة الفترة: </span>
          <strong className="tnum text-foreground">
            {fmtGrams(period.gold)} · {fmtMoney(period.cash)}
          </strong>
        </div>
      </div>

      <div className="mt-4 divide-y divide-border pb-6">
        {filtered.map((t) => {
          const other = t.merchant_id === id ? t.counterparty?.name : t.merchant?.name;
          return (
            <div key={t.id} className={t.status === "voided" ? "py-4 opacity-55" : "group py-4"}>
              <div className="flex items-start justify-between gap-3">
                <Link to="/transactions/$id/edit" params={{ id: t.id }} className="min-w-0 flex-1">
                  <p className="font-extrabold group-hover:text-primary">
                    {KIND_SHORT[t.kind]}
                    {t.status === "voided" ? " · ملغاة" : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fmtDate(t.txn_date)}
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
                      {l.label || "بند"}
                      {Number(l.weight) ? ` · ${fmtGrams(Number(l.weight))}` : ""}
                    </span>
                  ))}
                </div>
              ) : null}
              {me?.isAdmin && t.status === "posted" ? (
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
        })}
        {filtered.length === 0 ? (
          <div className="py-14 text-center text-muted-foreground">مافيش حركات في الفترة دي.</div>
        ) : null}
      </div>

      <Dialog open={Boolean(voidId)} onOpenChange={(open) => !open && setVoidId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-start">إلغاء الحركة</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            الحركة مش هتأثر على الأرصدة، لكنها هتفضل ظاهرة في سجل التعديلات.
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
    </AppShell>
  );
}
