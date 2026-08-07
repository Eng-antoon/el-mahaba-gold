import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
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
  merchantsQuery,
  transactionQuery,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const searchSchema = z.object({
  merchant: z.string().optional(),
  kind: z.enum(["inbound", "settlement", "purchase", "sale", "transfer"]).optional(),
  transaction: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "حركة — المحبة للذهب" },
      { name: "description", content: "سجّل وارد أو تسديد أو شراء وبيع دهب مع أي تاجر بسرعة." },
      { property: "og:title", content: "حركة — المحبة للذهب" },
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
  const { data: balances = [] } = useQuery(balancesQuery);
  const { data: existing } = useQuery({
    ...transactionQuery(search.transaction ?? "00000000-0000-0000-0000-000000000000"),
    enabled: Boolean(search.transaction),
  });

  const [merchantId, setMerchantId] = useState<string | null>(search.merchant ?? null);
  const [kind, setKind] = useState<TxnKind>(search.kind ?? "inbound");
  const [date, setDate] = useState(todayISO());
  const [goldPrice, setGoldPrice] = useState(0);
  const [notes, setNotes] = useState("");
  const [counterparty, setCounterparty] = useState<string | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [karat, setKarat] = useState(875);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!existing || hydrated.current) return;
    hydrated.current = true;
    setMerchantId(existing.merchant_id);
    setKind(existing.kind);
    setDate(existing.txn_date);
    setGoldPrice(Number(existing.gold_price_used ?? 0));
    setNotes(existing.notes ?? "");
    setCounterparty(existing.counterparty_merchant_id);
    const loaded = [...existing.transaction_lines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        key: l.id,
        categoryId: l.category_id,
        method: l.method,
        purity: Number(l.purity),
        weight: Number(l.weight),
        pieces: Number(l.pieces ?? 0),
        rate: Number(l.rate_per_gram),
        amount:
          l.method === "cash" || l.method === "wage_to_gold" || existing.kind === "transfer"
            ? Number(l.cash_amount)
            : 0,
      }));
    setLines(loaded.length ? loaded : [newLine()]);
    setKarat(Number(loaded[0]?.purity ?? 875));
  }, [existing]);

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
  const needsGoldPrice =
    kind === "purchase" || kind === "sale" || lines.some((line) => line.method === "wage_to_gold");

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

  const affectedPreview = useMemo(() => {
    if (!existing || !merchantId) return [];
    const oldIds = [existing.merchant_id];
    if (existing.kind === "transfer" && existing.counterparty_merchant_id) {
      oldIds.push(existing.counterparty_merchant_id);
    }
    const newIds = [merchantId];
    if (kind === "transfer" && counterparty) newIds.push(counterparty);

    return [...new Set([...oldIds, ...newIds])].map((id) => {
      const current = balances.find((balance) => balance.merchant_id === id);
      const beforeGold = Number(current?.gold_21 ?? 0);
      const beforeCash = Number(current?.cash ?? 0);
      return {
        id,
        name: merchants.find((candidate) => candidate.id === id)?.name ?? "تاجر",
        beforeGold,
        beforeCash,
        afterGold:
          beforeGold -
          (oldIds.includes(id) ? Number(existing.total_gold_21) : 0) +
          (newIds.includes(id) ? totalGold : 0),
        afterCash:
          beforeCash -
          (oldIds.includes(id) ? Number(existing.total_cash) : 0) +
          (newIds.includes(id) ? totalCash : 0),
      };
    });
  }, [balances, counterparty, existing, kind, merchantId, merchants, totalCash, totalGold]);

  const save = useMutation({
    mutationFn: async () => {
      if (!merchantId) throw new Error("اختار التاجر الأول");
      if (kind === "transfer" && !counterparty) throw new Error("اختار التاجر المحوَّل له");
      const valid = lines.filter((l, i) => {
        const r = results[i]!;
        return Math.abs(r.goldDelta) > 0 || Math.abs(r.cashDelta) > 0;
      });
      if (valid.length === 0) throw new Error("مافيش بنود مكتوبة");
      if (needsGoldPrice && goldPrice <= 0) throw new Error("اكتب سعر جرام عيار 21 للحركة");
      if (valid.some((line) => line.purity < 500 || line.purity > 1000)) {
        throw new Error("راجع العيار؛ لازم يكون بين 500 و1000");
      }
      if (isGoodsKind && valid.some((line) => !line.categoryId)) {
        throw new Error("اختار الصنف لكل بند");
      }
      if (
        valid.some((line) => {
          const category = categories.find((candidate) => candidate.id === line.categoryId);
          return category?.tracks_count && line.pieces <= 0;
        })
      ) {
        throw new Error("اكتب عدد الغوايش");
      }

      const payloadLines = lines.flatMap((l, i) => {
        const r = results[i]!;
        if (Math.abs(r.goldDelta) === 0 && Math.abs(r.cashDelta) === 0) return [];
        const cat = categories.find((c) => c.id === l.categoryId);
        return [
          {
            category_id: l.categoryId,
            label: cat?.name_ar ?? (l.method ? METHOD_LABELS[l.method] : ""),
            method: kind === "settlement" ? l.method : kind === "transfer" ? "transfer" : null,
            purity: l.purity,
            weight: l.weight,
            pieces: cat?.tracks_count && l.pieces ? l.pieces : null,
            rate: l.rate,
            amount: l.amount,
          },
        ];
      });
      const { data, error } = await supabase.rpc("save_transaction", {
        _transaction_id: search.transaction ?? null,
        _payload: {
          merchant_id: merchantId,
          counterparty_merchant_id: kind === "transfer" ? counterparty : null,
          kind,
          txn_date: date,
          gold_price_used: needsGoldPrice ? goldPrice || null : null,
          notes: notes.trim() || null,
          lines: payloadLines,
        },
      });
      if (error) throw new Error(error.message);
      return { merchantId, transactionId: data };
    },
    onSuccess: ({ merchantId: id }) => {
      toast.success(search.transaction ? "تم تعديل الحركة" : "تم حفظ الحركة");
      qc.invalidateQueries();
      navigate({ to: "/merchants/$id", params: { id: id! } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  return (
    <AppShell title={search.transaction ? "تعديل حركة" : "حركة جديدة"}>
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
            <p className="text-sm text-muted-foreground">أضف تاجر الأول من صفحة التجار.</p>
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

              <div className={needsGoldPrice ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>
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
                {needsGoldPrice ? (
                  <NumField
                    label="سعر جرام عيار 21 للحركة (جنيه)"
                    value={goldPrice}
                    onChange={setGoldPrice}
                    step="1"
                  />
                ) : null}
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
              onClick={() => (search.transaction ? setConfirmOpen(true) : save.mutate())}
              disabled={save.isPending}
            >
              {save.isPending ? "..." : search.transaction ? "راجع التعديل" : "حفظ"}
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">تأكيد تعديل الحركة</AlertDialogTitle>
            <AlertDialogDescription className="text-start leading-7">
              التعديل هيغيّر رصيد التاجر ولو كانت الحركة تحويل هيغيّر رصيد التاجرين. راجع الفرق قبل
              التأكيد؛ النسخة القديمة والجديدة هيفضلوا محفوظين في سجل التعديلات.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            {affectedPreview.map((row) => (
              <div key={row.id} className="rounded-xl bg-muted p-3 text-sm">
                <p className="mb-2 font-extrabold">{row.name}</p>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground">الرصيد الحالي</p>
                    <p className="tnum mt-1 font-bold">{fmtGrams(row.beforeGold)}</p>
                    <p className="tnum font-bold">{fmtMoney(row.beforeCash)}</p>
                  </div>
                  <span className="text-muted-foreground">←</span>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground">بعد التعديل</p>
                    <p className="tnum mt-1 font-extrabold">{fmtGrams(row.afterGold)}</p>
                    <p className="tnum font-extrabold">{fmtMoney(row.afterCash)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>رجوع</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate()} disabled={save.isPending}>
              تأكيد التعديل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  onRemove?: (() => void) | undefined;
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
              label={
                mType === "raw" && kind !== "inbound"
                  ? "مصنعية للجرام (جنيه)"
                  : "المصنعية للجرام (جنيه)"
              }
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
                  min={500}
                  max={1000}
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
        {result.cashAmount !== 0 ? (
          <span className="tnum">{fmtMoney(result.cashAmount)}</span>
        ) : null}
        {result.weight21 === 0 && result.cashAmount === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : null}
        {line.weight > 0 && result.weight21 !== 0 ? (
          <span className="tnum w-full text-[11px] font-semibold text-muted-foreground">
            {line.weight} جم × {line.purity} ÷ 875 = {fmtGrams(result.weight21)} عيار 21
          </span>
        ) : null}
      </div>
    </Card>
  );
}
