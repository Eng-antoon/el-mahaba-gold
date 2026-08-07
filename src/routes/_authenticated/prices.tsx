import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { NumField } from "@/components/num-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { pricesQuery } from "@/lib/db";
import { fmtDate, fmtMoney, todayISO } from "@/lib/gold-math";

export const Route = createFileRoute("/_authenticated/prices")({
  head: () => ({
    meta: [
      { title: "سعر الدهب — دفتر الصاغة" },
      { name: "description", content: "سجّل سعر جرام عيار 21 اليومي وشوف تاريخ الأسعار." },
      { property: "og:title", content: "سعر الدهب — دفتر الصاغة" },
      { property: "og:description", content: "سجّل سعر جرام عيار 21 اليومي." },
    ],
  }),
  component: PricesPage,
});

function PricesPage() {
  const qc = useQueryClient();
  const { data: prices = [] } = useQuery(pricesQuery);
  const [date, setDate] = useState(todayISO());
  const [price, setPrice] = useState(0);

  const save = useMutation({
    mutationFn: async () => {
      if (!price || price <= 0) throw new Error("اكتب سعر صحيح");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("gold_prices").insert({
        price_date: date,
        price_per_gram_21: price,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم تسجيل السعر");
      setPrice(0);
      qc.invalidateQueries({ queryKey: ["prices"] });
      qc.invalidateQueries({ queryKey: ["latest_price"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="سعر الدهب">
      <Card className="space-y-4 p-4">
        <h2 className="text-base font-extrabold">تسجيل سعر جديد</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-bold">التاريخ</Label>
            <Input
              type="date"
              dir="ltr"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tnum h-12 text-base"
            />
          </div>
          <NumField
            label="سعر جرام عيار 21 (جنيه)"
            value={price}
            onChange={setPrice}
            step="1"
          />
        </div>
        <Button
          className="h-12 w-full text-base font-bold"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          {save.isPending ? "جاري الحفظ..." : "حفظ السعر"}
        </Button>
      </Card>

      <h3 className="mt-5 text-lg font-extrabold">تاريخ الأسعار</h3>
      <div className="mt-3 space-y-2 pb-6">
        {prices.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">مافيش أسعار مسجلة.</Card>
        ) : (
          prices.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3"
            >
              <span className="text-sm font-bold">{fmtDate(p.price_date)}</span>
              <span className="tnum text-base font-extrabold">
                {fmtMoney(Number(p.price_per_gram_21))}
              </span>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
