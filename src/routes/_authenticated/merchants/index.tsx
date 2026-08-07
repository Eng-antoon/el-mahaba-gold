import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { BalanceValue } from "@/components/balance-value";
import { ChipGroup } from "@/components/chip-group";
import { balancesQuery, merchantsQuery } from "@/lib/db";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MerchantType } from "@/lib/gold-math";

export const Route = createFileRoute("/_authenticated/merchants/")({
  head: () => ({
    meta: [
      { title: "التجار — المحبة للذهب" },
      { name: "description", content: "كل التجار وأرصدتهم بالذهب والفلوس، وإضافة تاجر جديد." },
      { property: "og:title", content: "التجار — المحبة للذهب" },
      { property: "og:description", content: "كل التجار وأرصدتهم بالذهب والفلوس." },
    ],
  }),
  component: MerchantsPage,
});

const merchantSchema = z.object({
  name: z.string().trim().min(1, { message: "لازم تكتب اسم التاجر" }).max(100),
  phone: z.string().trim().max(30).optional(),
  merchant_type: z.enum(["jewelry", "raw"]),
  notes: z.string().trim().max(500).optional(),
});

function MerchantsPage() {
  const qc = useQueryClient();
  const { data: merchants = [] } = useQuery(merchantsQuery);
  const { data: balances = [] } = useQuery(balancesQuery);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | MerchantType>("all");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<MerchantType>("jewelry");
  const [notes, setNotes] = useState("");

  const balanceMap = useMemo(() => new Map(balances.map((b) => [b.merchant_id, b])), [balances]);

  const create = useMutation({
    mutationFn: async () => {
      const parsed = merchantSchema.safeParse({
        name,
        phone,
        merchant_type: type,
        notes,
      });
      if (!parsed.success) throw new Error(parsed.error.errors[0]?.message ?? "بيانات غير صحيحة");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("merchants").insert({
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        merchant_type: parsed.data.merchant_type,
        notes: parsed.data.notes || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("تم إضافة التاجر");
      setOpen(false);
      setName("");
      setPhone("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["merchants"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = useMemo(() => {
    const term = q.trim();
    return merchants.filter(
      (m) => (filter === "all" || m.merchant_type === filter) && (!term || m.name.includes(term)),
    );
  }, [merchants, q, filter]);

  return (
    <AppShell title="التجار">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChipGroup
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all" as const, label: "الكل" },
            { value: "jewelry" as const, label: "مشغولات" },
            { value: "raw" as const, label: "خام" },
          ]}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="h-11 gap-2 font-bold">
              <Plus className="h-4 w-4" />
              تاجر جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-start text-lg font-extrabold">تاجر جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <ChipGroup
                label="نوع التاجر"
                value={type}
                onChange={setType}
                options={[
                  { value: "jewelry" as const, label: "تاجر مشغولات" },
                  { value: "raw" as const, label: "تاجر خام" },
                ]}
              />
              <div className="space-y-1.5">
                <Label className="font-bold">الاسم</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسم التاجر"
                  className="h-12 text-base"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold">التليفون</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  dir="ltr"
                  placeholder="01xxxxxxxxx"
                  className="h-12 text-base"
                  maxLength={30}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-bold">ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                className="h-12 w-full text-base font-bold"
                onClick={() => create.mutate()}
                disabled={create.isPending}
              >
                {create.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث باسم التاجر"
          className="h-12 pe-10 text-base"
        />
      </div>

      <div className="mt-4 space-y-2.5">
        {list.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">مافيش نتايج.</Card>
        ) : (
          list.map((m) => {
            const b = balanceMap.get(m.id);
            return (
              <Link
                key={m.id}
                to="/merchants/$id"
                params={{ id: m.id }}
                className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/25"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold">{m.name}</p>
                    <p className="text-xs font-semibold text-muted-foreground">
                      {m.merchant_type === "raw" ? "تاجر خام" : "تاجر مشغولات"}
                      {m.phone ? ` · ${m.phone}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <BalanceValue value={Number(b?.gold_21 ?? 0)} unit="gold" size="sm" />
                    <div>
                      <BalanceValue value={Number(b?.cash ?? 0)} unit="cash" size="sm" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
