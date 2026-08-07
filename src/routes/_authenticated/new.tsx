import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { ChipGroup } from "@/components/chip-group";
import { NumField } from "@/components/num-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  balancesQuery,
  categoriesQuery,
  latestPriceQuery,
  merchantsQuery,
  type ItemCategory,
} from "@/lib/db";
import {
  computeLine,
  fmtGrams,
  fmtMoney,
  KIND_LABELS,
  KINDS_BY_TYPE,
  METHOD_LABELS,
  METHODS_BY_TYPE,
  methodShape,
  PURITIES,
  todayISO,
  type MerchantType,
  type PayMethod,
  type TxnKind,
} from "@/lib/gold-math";

const searchSchema = z.object({
  merchant: z.string().optional(),
  kind: z.enum(["inbound", "settlement", "purchase", "sale", "transfer"]).optional(),
});

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "حركة جديدة — دفتر الصاغة" },
      { name: "description", content: "سجّل وارد أو تسديد أو شراء وبيع دهب مع أي تاجر بسرعة." },
      { property: "og:title", content: "حركة جديدة — دفتر الصاغة" },
      { property: "og:description", content: "سجّل وارد أو تسديد أو شراء وبيع دهب مع أي تاجر." },
    ],
  }),
  component: NewTxnPage,
});

interface DraftLine {
  key: string;
  categoryId: string | null;
  method: PayMethod | null;
  purity: number;
  weight: number;
  pieces: number;
  rate: number;
  amount: number;
}

function newLine(purity = 875): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    categoryId: null,
    method: null,
    purity,
    weight: 0,
    pieces: 0,
    rate: 0,
    amount: 0,
  };
}

function NewTxnPage() {
  const search = useSearch({ from: "/_authenticated/new" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: merchants = [] } = useQuery(merchantsQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const { data: latestPrice } = useQuery(latestPriceQuery);

  const [merchantId, setMerchantId] = useState<string | null>(search.merchant ?? null);
  const [kind, setKind] = useState<TxnKind>(search.kind ?? "inbound");
  const [date, setDate] = useState(todayISO());
  const [goldPrice, setGoldPrice] = useState(0);
  const [notes, setNotes] = useState("");
  const [counterparty, setCounterparty] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [karat, setKarat] = useState(875);

  useEffect(() => {
    if (latestPrice && goldPrice === 0) setGoldPrice(Number(latestPrice.price_per_gram_21));
  }, [latestPrice, goldPrice]);

  const merchant = merchants.find((m) => m.id === merchantId) ?? null;
  const mType: MerchantType = (merchant?.merchant_type ?? "jewelry") as MerchantType;
  const allowedKinds = KINDS_BY_TYPE[mType];

  useEffect(() => {
    if (!allowedKinds.includes(kind)) setKind(allowedKinds[0]!);
  }, [allowedKinds, kind]);

  const scopedCategories = useMemo(
    () => categories.filter((c) => c.scope === mType),
    [categories, mType],
  );

  const isGoodsKind = kind === "inbound" || kind === "purchase" || kind === "sale";

  const results = lines.map((l) =>
    computeLine({
      kind,
      method: kind === "settlement" ? l.method : kind === "transfer" ? "transfer" : null,
      purity: l.purity,
      weight: l.weight,
      pieces: l.pieces,
      rate: l.rate,
      amount: l.amount,
      goldPrice,
    }),
  );

  const totalGold = results.reduce((s, r) => s + r.goldDelta, 0);
  const totalCash = results.reduce((s, r) => s + r.cashDelta, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!merchantId) throw new Error("اختار التاجر الأول");
      if (kind === "transfer" && !counterparty) throw new Error("اختار التاجر المحوَّل له");
      const valid = lines.filter((l, i) => {
        const r = results[i]!;
        return Math.abs(r.goldDelta) > 0 || Math.abs(r.cashDelta) > 0;
      });
      if (valid.length === 0) throw new Error("مافيش بنود مكتوبة");

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      const { data: txn, error } = await supabase
        .from("transactions")
        .insert({
          merchant_id: merchantId,
          counterparty_merchant_id: kind === "transfer" ? counterparty : null,
          kind,
          txn_date: date,
          gold_price_used: goldPrice || null,
          notes: notes.trim() || null,
          total_gold_21: totalGold,
          total_cash: totalCash,
          created_by: uid,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      const payload = lines.flatMap((l, i) => {
        const r = results[i]!;
        if (Math.abs(r.goldDelta) === 0 && Math.abs(r.cashDelta) === 0) return [];
        const cat = categories.find((c) => c.id === l.categoryId);
        return [
          {
            transaction_id: txn.id,
            category_id: l.categoryId,
            label: cat?.name_ar ?? (l.method ? METHOD_LABELS[l.method] : ""),
            method: kind === "settlement" ? l.method : kind === "transfer" ? "transfer" : null,
            purity: l.purity,
            weight: l.weight,
            pieces: cat?.tracks_count && l.pieces ? l.pieces : null,
            rate_per_gram: l.rate,
            weight_21: r.weight21,
            cash_amount: r.cashAmount,
            gold_delta: r.goldDelta,
            cash_delta: r.cashDelta,
            sort_order: i,
          },
        ];
      });

      const { error: lineErr } = await supabase.from("transaction_lines").insert(payload);
      if (lineErr) throw new Error(lineErr.message);

      // الطرف الآخر في التحويل: أثر معاكس
      if (kind === "transfer" && counterparty) {
        const { data: mirror, error: mErr } = await supabase
          .from("transactions")
          .insert({
            merchant_id: counterparty,
            counterparty_merchant_id: merchantId,
            kind: "transfer",
            txn_date: date,
            gold_price_used: goldPrice || null,
            notes: `تحويل من ${merchant?.name ?? ""}${notes.trim() ? " — " + notes.trim() : ""}`,
            total_gold_21: -totalGold,
            total_cash: -totalCash,
            created_by: uid,
          })
          .select("id")
          .single();
        if (mErr) throw new Error(mErr.message);
        const mirrorLines = payload.map((p) => ({
          ...p,
          transaction_id: mirror.id,
          gold_delta: -p.gold_delta,
          cash_delta: -p.cash_delta,
        }));
        const { error: mlErr } = await supabase.from("transaction_lines").insert(mirrorLines);
        if (mlErr) throw new Error(mlErr.message);
      }

      return merchantId;
    },
    onSuccess: (id) => {
      toast.success("تم حفظ الحركة");
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["merchant_txns", id] });
      qc.invalidateQueries({ queryKey: ["merchant_breakdown", id] });
      navigate({ to: "/merchants/$id", params: { id: id! } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  return (
    <AppShell title="حركة جديدة">
      <div className="space-y-4 pb-32">
        <Card className="space-y-4 p-4">
          <ChipGroup
            label="التاجر"
            value={merchantId}
            onChange={(v) => setMerchantId(v)}
            options={merchants.map((m) => ({
              value: m.id,
              label: m.name,
              hint: m.merchant_type === "raw" ? "خام" : "مشغولات",
            }))}
          />
          {merchants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              أضف تاجر الأول من صفحة التجار.
            </p>
          ) : null}
        </Card>

        {merchantId ? (
          <>
            <Card className="space-y-4 p-4">
              <ChipGroup
                label="نوع الحركة"
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  setLines([newLine(v === "inbound" ? karat : 875)]);
                }}
                options={allowedKinds.map((k) => ({ value: k, label: KIND_LABELS[k] }))}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-bold">التاريخ</Label>
                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="tnum h-12 text-base"
                    dir="ltr"
                  />
                </div>
                <NumField
                  label="سعر جرام عيار 21 (جنيه)"
                  value={goldPrice}
                  onChange={setGoldPrice}
                  step="1"
                />
              </div>

              {kind === "transfer" ? (
                <ChipGroup
                  label="محوَّل لحساب"
                  value={counterparty}
                  onChange={setCounterparty}
                  options={merchants
                    .filter((m) => m.id !== merchantId)
                    .map((m) => ({ value: m.id, label: m.name }))}
                />
              ) : null}

              {isGoodsKind ? (
                <ChipGroup
                  label="العيار"
                  value={karat}
                  onChange={(v) => {
                    setKarat(v);
                    setLines((prev) => prev.map((l) => ({ ...l, purity: v })));
                  }}
                  options={
                    mType === "jewelry"
                      ? [
                          { value: 875, label: "عيار 21" },
                          { value: 750, label: "عيار 18" },
                        ]
                      : PURITIES.map((p) => ({ value: p.value, label: p.label }))
                  }
                />
              ) : null}
            </Card>

            <div className="space-y-3">
              {lines.map((line, i) => (
                <LineCard
                  key={line.key}
                  index={i}
                  line={line}
                  kind={kind}
                  mType={mType}
                  categories={scopedCategories}
                  result={results[i]!}
                  onChange={(patch) => updateLine(line.key, patch)}
                  onRemove={
                    lines.length > 1
                      ? () => setLines((prev) => prev.filter((l) => l.key !== line.key))
                      : undefined
                  }
                />
              ))}
              <Button
                variant="outline"
                className="h-12 w-full gap-2 font-bold"
                onClick={() => setLines((prev) => [...prev, newLine(isGoodsKind ? karat : 875)])}
              >
                <Plus className="h-4 w-4" />
                بند إضافي (نفس الشروة)
              </Button>
            </div>

            <Card className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-bold">ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="اختياري"
                />
              </div>
            </Card>
          </>
        ) : null}
      </div>

      {merchantId ? (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-card/98 px-4 py-3 backdrop-blur md:bottom-0">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-xs font-bold text-muted-foreground">
                أثر الحركة على حساب {merchant?.name}
              </p>
              <p className="tnum truncate text-sm font-extrabold">
                <span className={totalGold >= 0 ? "text-owed" : "text-credit"}>
                  {fmtGrams(totalGold)} {totalGold >= 0 ? "عليّ" : "ليّ"}
                </span>
                <span className="mx-2 text-muted-foreground">·</span>
                <span className={totalCash >= 0 ? "text-owed" : "text-credit"}>
                  {fmtMoney(totalCash)} {totalCash >= 0 ? "عليّ" : "ليّ"}
                </span>
              </p>
            </div>
            <Button
              className="h-12 shrink-0 px-6 text-base font-bold"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? "..." : "حفظ"}
            </Button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function LineCard({
  index,
  line,
  kind,
  mType,
  categories,
  result,
  onChange,
  onRemove,
}: {
  index: number;
  line: DraftLine;
  kind: TxnKind;
  mType: MerchantType;
  categories: ItemCategory[];
  result: ReturnType<typeof computeLine>;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove?: () => void;
}) {
  const cat = categories.find((c) => c.id === line.categoryId) ?? null;
  const isGoods = kind === "inbound" || kind === "purchase" || kind === "sale";
  const shape = kind === "settlement" && line.method ? methodShape(line.method) : null;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
          بند {index + 1}
        </span>
        {onRemove ? (
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="حذف البند">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
      </div>

      {isGoods ? (
        <>
          <ChipGroup
            label="الصنف"
            value={line.categoryId}
            onChange={(v) => {
              const c = categories.find((x) => x.id === v);
              onChange({
                categoryId: v,
                weight: c?.fixed_weight ? Number(c.fixed_weight) : line.weight,
                purity: c?.fixed_purity ? Number(c.fixed_purity) : line.purity,
              });
            }}
            options={categories.map((c) => ({
              value: c.id,
              label: c.name_ar,
              hint: c.fixed_weight ? `${Number(c.fixed_weight)} جم` : undefined,
            }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField
              label="الوزن (جرام)"
              value={line.weight}
              onChange={(v) => onChange({ weight: v })}
            />
            <NumField
              label={mType === "raw" && kind !== "inbound" ? "مصنعية للجرام (جنيه)" : "المصنعية للجرام (جنيه)"}
              value={line.rate}
              onChange={(v) => onChange({ rate: v })}
              step="1"
            />
          </div>
          {cat?.tracks_count ? (
            <NumField
              label="العدد"
              value={line.pieces}
              onChange={(v) => onChange({ pieces: v })}
              step="1"
            />
          ) : null}
        </>
      ) : kind === "transfer" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField
            label="دهب محوَّل (جرام عيار 21)"
            value={line.weight}
            onChange={(v) => onChange({ weight: v, purity: 875 })}
          />
          <NumField
            label="فلوس محوَّلة (جنيه)"
            value={line.amount}
            onChange={(v) => onChange({ amount: v })}
            step="1"
          />
        </div>
      ) : (
        <>
          <ChipGroup
            label="طريقة التسديد"
            value={line.method}
            onChange={(v) => {
              const s = methodShape(v);
              onChange({
                method: v,
                purity: s.fixedPurity ?? 875,
                weight: 0,
                amount: 0,
                rate: 0,
              });
            }}
            options={METHODS_BY_TYPE[mType].map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
          />

          {shape ? (
            <>
              {shape.purity === "free" ? (
                <NumField
                  label="العيار (من 1000)"
                  value={line.purity}
                  onChange={(v) => onChange({ purity: v })}
                  step="1"
                />
              ) : shape.purity === "choose" ? (
                <ChipGroup
                  label="العيار"
                  value={line.purity}
                  onChange={(v) => onChange({ purity: v })}
                  options={PURITIES.map((p) => ({ value: p.value, label: p.label }))}
                />
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                {shape.weight ? (
                  <NumField
                    label="الوزن (جرام)"
                    value={line.weight}
                    onChange={(v) => onChange({ weight: v })}
                  />
                ) : null}
                {shape.amount ? (
                  <NumField
                    label="المبلغ (جنيه)"
                    value={line.amount}
                    onChange={(v) => onChange({ amount: v })}
                    step="1"
                  />
                ) : null}
                {shape.rateLabel ? (
                  <NumField
                    label={shape.rateLabel}
                    value={line.rate}
                    onChange={(v) => onChange({ rate: v })}
                    step="1"
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-muted/60 px-3 py-2.5 text-sm font-bold">
        <span className="text-muted-foreground">الناتج:</span>
        {result.weight21 !== 0 ? (
          <span className="tnum">
            {fmtGrams(result.weight21)} <span className="text-xs opacity-70">عيار 21</span>
          </span>
        ) : null}
        {result.cashAmount !== 0 ? <span className="tnum">{fmtMoney(result.cashAmount)}</span> : null}
        {result.weight21 === 0 && result.cashAmount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : null}
      </div>
    </Card>
  );
}
