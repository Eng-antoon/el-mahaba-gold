import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Search, Store, Trash2 } from "lucide-react";
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
  merchantDirectoryInfiniteQuery,
  merchantQuery,
  transactionQuery,
  type ItemCategory,
  type MerchantDirectoryRow,
} from "@/lib/db";
import {
  computeLine,
  fmtGrams,
  fmtMoney,
  KIND_LABELS,
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MerchantRowsSkeleton, QueryError } from "@/components/loading-states";
import { LoadMore } from "@/components/load-more";
import { cn } from "@/lib/utils";
import { transactionLineSummary } from "@/lib/transaction-line-summary";

const searchSchema = z.object({
  merchant: z.string().optional(),
  kind: z.enum(["inbound", "settlement", "purchase", "sale", "transfer"]).optional(),
  transaction: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/new")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "حركة — Mahaba Gold" },
      { name: "description", content: "سجّل وارد أو تسديد أو شراء وبيع دهب مع أي تاجر بسرعة." },
      { property: "og:title", content: "حركة — Mahaba Gold" },
      { property: "og:description", content: "سجّل وارد أو تسديد أو شراء وبيع دهب مع أي تاجر." },
    ],
  }),
  component: NewTxnPage,
});

interface DraftLine {
  key: string;
  kind: TxnKind;
  isReturn: boolean;
  categoryId: string | null;
  method: PayMethod | null;
  purity: number;
  weight: number;
  pieces: number;
  rate: number;
  amount: number;
  goldPrice: number;
}

function newLine(kind: TxnKind = "inbound", purity = 875): DraftLine {
  return {
    key: Math.random().toString(36).slice(2),
    kind,
    isReturn: false,
    categoryId: null,
    method: null,
    purity,
    weight: 0,
    pieces: 0,
    rate: 0,
    amount: 0,
    goldPrice: 0,
  };
}

type DocumentMode = "lines" | "sale" | "transfer";
type LineChoice = "inbound" | "settlement" | "purchase" | "return";

function NewTxnPage() {
  const search = useSearch({ from: "/_authenticated/new" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [merchantId, setMerchantId] = useState<string | null>(search.merchant ?? null);
  const [pickedMerchant, setPickedMerchant] = useState<MerchantDirectoryRow | null>(null);
  const [mode, setMode] = useState<DocumentMode>(
    search.kind === "sale" || search.kind === "transfer" ? search.kind : "lines",
  );
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [counterparty, setCounterparty] = useState<string | null>(null);
  const [pickedCounterparty, setPickedCounterparty] = useState<MerchantDirectoryRow | null>(null);
  const [lines, setLines] = useState<DraftLine[]>([newLine(search.kind ?? "inbound")]);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const hydrated = useRef(false);

  const { data: categories = [] } = useQuery(categoriesQuery);
  const { data: existing, isError: transactionUnavailable } = useQuery({
    ...transactionQuery(search.transaction ?? "00000000-0000-0000-0000-000000000000"),
    enabled: Boolean(search.transaction),
  });
  const { data: merchant } = useQuery({
    ...merchantQuery(merchantId ?? "00000000-0000-0000-0000-000000000000"),
    enabled: Boolean(merchantId),
  });
  const { data: counterpartyMerchant } = useQuery({
    ...merchantQuery(counterparty ?? "00000000-0000-0000-0000-000000000000"),
    enabled: Boolean(counterparty),
  });
  const { data: editMerchants = [] } = useQuery({
    queryKey: ["merchants", "edit-preview"],
    enabled: Boolean(search.transaction),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchants")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const { data: balances = [] } = useQuery({
    ...balancesQuery,
    enabled: Boolean(search.transaction),
  });

  useEffect(() => {
    if (!existing || hydrated.current) return;
    hydrated.current = true;
    setMerchantId(existing.merchant_id);
    setMode(existing.kind === "sale" || existing.kind === "transfer" ? existing.kind : "lines");
    setDate(existing.txn_date);
    setNotes(existing.notes ?? "");
    setCounterparty(existing.counterparty_merchant_id);
    const loaded = [...existing.transaction_lines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((l) => ({
        key: l.id,
        kind: l.kind as TxnKind,
        isReturn: l.is_return,
        categoryId: l.category_id,
        method: l.method,
        purity: Number(l.purity),
        weight: Number(l.weight),
        pieces: Number(l.pieces ?? 0),
        rate: Number(l.rate_per_gram),
        amount:
          l.method === "cash" ||
          l.method === "cash_received" ||
          l.method === "wage_to_gold" ||
          l.method === "bar_cashback" ||
          l.kind === "transfer"
            ? Number(l.cash_amount)
            : 0,
        goldPrice: Number(l.gold_price_per_gram ?? existing.gold_price_used ?? 0),
      }));
    setLines(loaded.length ? loaded : [newLine()]);
    setCollapsedKeys(new Set(loaded.map((line) => line.key)));
  }, [existing]);

  const mType: MerchantType = (merchant?.merchant_type ??
    pickedMerchant?.merchant_type ??
    "jewelry") as MerchantType;
  useEffect(() => {
    if (mode === "sale" && mType !== "raw") setMode("lines");
  }, [mType, mode]);

  const scopedCategories = useMemo(
    () => categories.filter((c) => c.scope === mType),
    [categories, mType],
  );

  const results = lines.map((l) =>
    computeLine({
      kind: l.kind,
      isReturn: l.isReturn,
      method: l.kind === "settlement" ? l.method : l.kind === "transfer" ? "transfer" : null,
      purity: l.purity,
      weight: l.weight,
      pieces: l.pieces,
      rate: l.rate,
      amount: l.amount,
      goldPrice: l.goldPrice,
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
    if (mode === "transfer" && counterparty) newIds.push(counterparty);

    return [...new Set([...oldIds, ...newIds])].map((id) => {
      const current = balances.find((balance) => balance.merchant_id === id);
      const beforeGold = Number(current?.gold_21 ?? 0);
      const beforeCash = Number(current?.cash ?? 0);
      return {
        id,
        name: editMerchants.find((candidate) => candidate.id === id)?.name ?? "تاجر",
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
  }, [balances, counterparty, editMerchants, existing, merchantId, mode, totalCash, totalGold]);

  const save = useMutation({
    mutationFn: async () => {
      if (!merchantId) throw new Error("اختار التاجر الأول");
      if (mode === "transfer" && !counterparty) throw new Error("اختار التاجر المحوَّل له");
      const valid = lines.filter((l, i) => {
        const r = results[i]!;
        return Math.abs(r.goldDelta) > 0 || Math.abs(r.cashDelta) > 0;
      });
      if (valid.length === 0) throw new Error("مافيش بنود مكتوبة");
      if (
        valid.some(
          (line) =>
            (line.kind === "purchase" ||
              line.kind === "sale" ||
              (line.kind === "settlement" && line.method === "wage_to_gold")) &&
            line.goldPrice <= 0,
        )
      ) {
        throw new Error("اكتب سعر الجرام لكل بند محتاج سعر");
      }
      if (valid.some((line) => line.purity < 500 || line.purity > 1000)) {
        throw new Error("راجع العيار؛ لازم يكون بين 500 و1000");
      }
      if (
        valid.some(
          (line) =>
            ["inbound", "purchase", "sale"].includes(line.kind) &&
            !(mType === "raw" && line.purity === 991) &&
            !line.categoryId,
        )
      ) {
        throw new Error("اختار الصنف لكل بند مشغولات أو خام");
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
            kind: l.kind,
            is_return: l.isReturn,
            method: l.kind === "settlement" ? l.method : l.kind === "transfer" ? "transfer" : null,
            purity: l.purity,
            weight: l.weight,
            pieces: cat?.tracks_count && l.pieces ? l.pieces : null,
            rate: l.rate,
            amount: l.amount,
            gold_price: l.goldPrice || null,
          },
        ];
      });
      const { data, error } = await supabase.rpc("save_transaction", {
        _transaction_id: search.transaction ?? null,
        _payload: {
          merchant_id: merchantId,
          counterparty_merchant_id: mode === "transfer" ? counterparty : null,
          kind: mode === "lines" ? (lines[0]?.kind ?? "inbound") : mode,
          txn_date: date,
          gold_price_used: null,
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

  function chooseMerchant(row: MerchantDirectoryRow) {
    const nextMode: DocumentMode =
      search.kind === "transfer" || (search.kind === "sale" && row.merchant_type === "raw")
        ? search.kind
        : "lines";
    setPickedMerchant(row);
    setMerchantId(row.merchant_id);
    setCounterparty(null);
    setPickedCounterparty(null);
    setMode(nextMode);
    setLines([newLine(nextMode === "lines" ? (search.kind ?? "inbound") : nextMode)]);
    setCollapsedKeys(new Set());
  }

  if (search.transaction && transactionUnavailable) {
    return (
      <AppShell title="الحركة غير متاحة">
        <Card className="p-8 text-center text-muted-foreground">
          الحركة غير موجودة أو لم تعد متاحة.
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title={search.transaction ? "تعديل حركة" : "حركة جديدة"}>
      <div className="space-y-6 pb-32">
        <section className="border-b border-border pb-6">
          <StepHeading number="1" title="اختار التاجر" done={Boolean(merchantId)} />
          {merchantId && (merchant || pickedMerchant) ? (
            <SelectedMerchant
              merchant={
                pickedMerchant ?? {
                  merchant_id: merchant!.id,
                  name: merchant!.name,
                  merchant_type: merchant!.merchant_type,
                  phone: merchant!.phone,
                  gold_21: 0,
                  cash: 0,
                  last_txn_date: null,
                }
              }
              onChange={() => {
                setMerchantId(null);
                setPickedMerchant(null);
                setCounterparty(null);
                setPickedCounterparty(null);
              }}
            />
          ) : (
            <MerchantPicker selectedId={merchantId} onSelect={chooseMerchant} />
          )}
        </section>

        {merchantId ? (
          <>
            <section className="page-enter space-y-4 border-b border-border pb-6">
              <StepHeading number="2" title="تفاصيل الحركة" />
              <ChipGroup
                label="طريقة التسجيل"
                value={mode}
                onChange={(v) => {
                  setMode(v);
                  setCounterparty(null);
                  setPickedCounterparty(null);
                  setLines([newLine(v === "lines" ? "inbound" : v)]);
                  setCollapsedKeys(new Set());
                }}
                options={[
                  { value: "lines", label: "بنود متنوعة" },
                  ...(mType === "raw" ? [{ value: "sale" as const, label: KIND_LABELS.sale }] : []),
                  { value: "transfer", label: KIND_LABELS.transfer },
                ]}
              />

              <div className="space-y-1.5">
                <Label className="text-sm font-bold">التاريخ</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="tnum h-12 text-start text-base"
                  dir="rtl"
                />
              </div>

              {mode === "transfer" ? (
                <div className="space-y-2">
                  <Label className="font-bold">محوَّل لحساب</Label>
                  {counterparty && (counterpartyMerchant || pickedCounterparty) ? (
                    <SelectedMerchant
                      compact
                      merchant={
                        pickedCounterparty ?? {
                          merchant_id: counterpartyMerchant!.id,
                          name: counterpartyMerchant!.name,
                          merchant_type: counterpartyMerchant!.merchant_type,
                          phone: counterpartyMerchant!.phone,
                          gold_21: 0,
                          cash: 0,
                          last_txn_date: null,
                        }
                      }
                      onChange={() => {
                        setCounterparty(null);
                        setPickedCounterparty(null);
                      }}
                    />
                  ) : (
                    <MerchantPicker
                      compact
                      selectedId={counterparty}
                      excludeId={merchantId}
                      onSelect={(row) => {
                        setCounterparty(row.merchant_id);
                        setPickedCounterparty(row);
                      }}
                    />
                  )}
                </div>
              ) : null}
            </section>

            <div className="space-y-3">
              <StepHeading number="3" title="اكتب البنود" />
              {lines.map((line, i) => {
                const remove =
                  lines.length > 1
                    ? () => {
                        setLines((prev) => prev.filter((candidate) => candidate.key !== line.key));
                        setCollapsedKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(line.key);
                          return next;
                        });
                      }
                    : undefined;
                return collapsedKeys.has(line.key) ? (
                  <LineSummary
                    key={line.key}
                    index={i}
                    line={line}
                    result={results[i]!}
                    categories={scopedCategories}
                    onEdit={() =>
                      setCollapsedKeys((prev) => {
                        const next = new Set(prev);
                        next.delete(line.key);
                        return next;
                      })
                    }
                    onRemove={remove}
                  />
                ) : (
                  <LineCard
                    key={line.key}
                    index={i}
                    line={line}
                    lockedKind={mode === "lines" ? undefined : mode}
                    mType={mType}
                    categories={scopedCategories}
                    result={results[i]!}
                    onChange={(patch) => updateLine(line.key, patch)}
                    onCollapse={() =>
                      setCollapsedKeys((prev) => {
                        const next = new Set(prev);
                        next.add(line.key);
                        return next;
                      })
                    }
                    onRemove={remove}
                  />
                );
              })}
              <Button
                variant="outline"
                className="h-12 w-full gap-2 font-bold"
                onClick={() => {
                  setCollapsedKeys(
                    new Set(
                      lines
                        .filter((_, index) => {
                          const result = results[index]!;
                          return Math.abs(result.goldDelta) > 0 || Math.abs(result.cashDelta) > 0;
                        })
                        .map((line) => line.key),
                    ),
                  );
                  setLines((prev) => [...prev, newLine(mode === "lines" ? "inbound" : mode)]);
                }}
              >
                <Plus className="h-4 w-4" />
                بند إضافي
              </Button>
            </div>

            <section className="space-y-3 border-t border-border pt-5">
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
            </section>
          </>
        ) : null}
      </div>

      {merchantId ? (
        <div className="fixed inset-x-0 bottom-16 z-20 border-t border-border bg-card/98 px-4 py-3 backdrop-blur md:bottom-0">
          <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-xs font-bold text-muted-foreground">
                إجمالي الذهب المستحق · إجمالي النقدية المستحقة
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

function StepHeading({
  number,
  title,
  done = false,
}: {
  number: string;
  title: string;
  done?: boolean;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold",
          done ? "bg-credit-soft text-credit" : "bg-primary text-primary-foreground",
        )}
      >
        {done ? <Check className="size-4" /> : number}
      </span>
      <h2 className="text-base font-extrabold">{title}</h2>
    </div>
  );
}

function SelectedMerchant({
  merchant,
  onChange,
  compact = false,
}: {
  merchant: Omit<MerchantDirectoryRow, "phone" | "last_txn_date"> & {
    phone: string | null;
    last_txn_date: string | null;
  };
  onChange: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 rounded-xl bg-card ring-1 ring-border",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
          <Store className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-extrabold">{merchant.name}</p>
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {merchant.merchant_type === "raw" ? "تاجر خام" : "تاجر مشغولات"}
            {merchant.phone ? ` · ${merchant.phone}` : ""}
          </p>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="shrink-0 gap-1 font-bold" onClick={onChange}>
        <Pencil className="size-3.5" />
        تغيير
      </Button>
    </div>
  );
}

function MerchantPicker({
  selectedId,
  excludeId,
  onSelect,
  compact = false,
}: {
  selectedId: string | null;
  excludeId?: string | null;
  onSelect: (merchant: MerchantDirectoryRow) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | MerchantType>("all");
  const search = useDebouncedValue(query.trim());
  const directory = useInfiniteQuery(
    merchantDirectoryInfiniteQuery({
      search,
      type: type === "all" ? null : type,
      sort: "name",
    }),
  );
  const rows = (directory.data?.pages.flatMap((page) => page.rows) ?? []).filter(
    (row) => row.merchant_id !== excludeId,
  );

  return (
    <div className={cn("space-y-3", compact && "rounded-xl bg-muted/40 p-3")}>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم التاجر"
            className="h-12 bg-card pe-10 text-base"
          />
        </div>
        <ChipGroup
          value={type}
          onChange={setType}
          className="shrink-0"
          options={[
            { value: "all" as const, label: "الكل" },
            { value: "jewelry" as const, label: "مشغولات" },
            { value: "raw" as const, label: "خام" },
          ]}
        />
      </div>
      <div
        className={cn(
          "divide-y divide-border border-y border-border",
          compact && "max-h-72 overflow-y-auto",
        )}
      >
        {directory.isLoading ? (
          <MerchantRowsSkeleton count={compact ? 3 : 5} />
        ) : directory.isError ? (
          <QueryError onRetry={() => directory.refetch()} />
        ) : rows.length ? (
          rows.map((row) => (
            <button
              key={row.merchant_id}
              type="button"
              onClick={() => onSelect(row)}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 text-start transition-colors hover:bg-accent/30 active:bg-accent/50",
                selectedId === row.merchant_id && "bg-accent/40",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-extrabold">{row.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.merchant_type === "raw" ? "خام" : "مشغولات"}
                  {row.phone ? ` · ${row.phone}` : ""}
                </span>
              </span>
              <span className="rounded-lg bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
                اختيار
              </span>
            </button>
          ))
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">مافيش تجار مطابقين.</p>
        )}
      </div>
      <LoadMore
        hasMore={Boolean(directory.hasNextPage)}
        loading={directory.isFetchingNextPage}
        onClick={() => directory.fetchNextPage()}
      />
    </div>
  );
}

function LineSummary({
  index,
  line,
  result,
  categories,
  onEdit,
  onRemove,
}: {
  index: number;
  line: DraftLine;
  result: ReturnType<typeof computeLine>;
  categories: ItemCategory[];
  onEdit: () => void;
  onRemove?: (() => void) | undefined;
}) {
  const category = categories.find((candidate) => candidate.id === line.categoryId);
  const summary = transactionLineSummary({
    index,
    kind: line.kind,
    isReturn: line.isReturn,
    method: line.method,
    categoryName: category?.name_ar,
    purity: line.purity,
    weight: line.weight,
    weight21: result.weight21,
    cashAmount: result.cashAmount,
  });

  return (
    <div className="page-enter flex items-center justify-between gap-3 rounded-xl bg-card p-3 shadow-sm ring-1 ring-border">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-start">
        <p className="truncate font-extrabold">{summary.title}</p>
        <p className="mt-0.5 truncate text-xs font-bold text-foreground/80">{summary.specific}</p>
        <p className="tnum mt-1 truncate text-xs font-semibold text-muted-foreground">
          {summary.meta}
        </p>
      </button>
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label="فتح البند">
          <ChevronDown className="size-4" />
        </Button>
        {onRemove ? (
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="حذف البند">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LineCard({
  index,
  line,
  lockedKind,
  mType,
  categories,
  result,
  onChange,
  onCollapse,
  onRemove,
}: {
  index: number;
  line: DraftLine;
  lockedKind?: "sale" | "transfer" | undefined;
  mType: MerchantType;
  categories: ItemCategory[];
  result: ReturnType<typeof computeLine>;
  onChange: (patch: Partial<DraftLine>) => void;
  onCollapse: () => void;
  onRemove?: (() => void) | undefined;
}) {
  const cat = categories.find((c) => c.id === line.categoryId) ?? null;
  const isGoods = line.kind === "inbound" || line.kind === "purchase" || line.kind === "sale";
  const shape = line.kind === "settlement" && line.method ? methodShape(line.method) : null;
  const choice: LineChoice = line.isReturn ? "return" : (line.kind as LineChoice);
  const visibleCategories =
    mType === "raw" ? categories.filter((c) => Number(c.fixed_purity) === line.purity) : categories;

  function changeLineChoice(next: LineChoice) {
    const isReturn = next === "return";
    const kind: TxnKind = isReturn ? "inbound" : next;
    onChange({
      kind,
      isReturn,
      categoryId: null,
      method: null,
      purity: 875,
      weight: 0,
      pieces: 0,
      rate: 0,
      amount: 0,
      goldPrice: 0,
    });
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">
          بند {index + 1}
        </span>
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="طي البند">
            <ChevronUp className="h-4 w-4" />
          </Button>
          {onRemove ? (
            <Button variant="ghost" size="icon" onClick={onRemove} aria-label="حذف البند">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      </div>

      {!lockedKind ? (
        <ChipGroup
          label="نوع البند"
          value={choice}
          onChange={changeLineChoice}
          options={[
            { value: "inbound", label: "وارد" },
            { value: "settlement", label: "تسديد" },
            { value: "purchase", label: "شراء" },
            { value: "return", label: "مرتجع" },
          ]}
        />
      ) : null}

      {isGoods ? (
        <>
          <ChipGroup
            label="العيار"
            value={line.purity}
            onChange={(purity) =>
              onChange({
                purity,
                categoryId: null,
                weight: 0,
                rate: mType === "raw" && purity === 991 ? 8 : 0,
              })
            }
            options={
              mType === "jewelry"
                ? [
                    { value: 875, label: "عيار 21" },
                    { value: 750, label: "عيار 18" },
                  ]
                : [
                    { value: 1000, label: "سبائك عيار 24" },
                    { value: 875, label: "عملات عيار 21" },
                    { value: 991, label: "بندقي 991" },
                  ]
            }
          />
          {mType !== "raw" || line.purity !== 991 ? (
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
              options={visibleCategories.map((c) => ({
                value: c.id,
                label: c.name_ar,
                hint: c.fixed_weight ? `${Number(c.fixed_weight)} جم` : undefined,
              }))}
            />
          ) : (
            <div className="rounded-xl bg-muted px-3 py-2 text-sm font-bold">
              رسم البندقي ثابت: 8 جنيه للجرام
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <NumField
              label="الوزن (جرام)"
              value={line.weight}
              onChange={(v) => onChange({ weight: v })}
            />
            <NumField
              label={
                mType === "raw" && line.purity === 991 ? "الرسم للجرام" : "المصنعية للجرام (جنيه)"
              }
              value={line.rate}
              onChange={(v) => onChange({ rate: mType === "raw" && line.purity === 991 ? 8 : v })}
              step="1"
            />
          </div>
          {line.kind === "purchase" || line.kind === "sale" ? (
            <NumField
              label="سعر جرام نفس العيار (جنيه)"
              value={line.goldPrice}
              onChange={(goldPrice) => onChange({ goldPrice })}
              step="1"
            />
          ) : null}
          {cat?.tracks_count ? (
            <NumField
              label="العدد"
              value={line.pieces}
              onChange={(v) => onChange({ pieces: v })}
              step="1"
            />
          ) : null}
        </>
      ) : line.kind === "transfer" ? (
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
                goldPrice: 0,
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
                    label={
                      line.method === "bar_cashback"
                        ? "الكاشباك (إجمالي جنيه)"
                        : line.method === "cash_received"
                          ? "النقدية المحصلة (جنيه)"
                          : line.method === "wage_to_gold"
                            ? "الفلوس (جنيه)"
                            : "المبلغ (جنيه)"
                    }
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
                {shape.needsPrice ? (
                  <NumField
                    label="سعر الجرام (جنيه)"
                    value={line.goldPrice}
                    onChange={(goldPrice) => onChange({ goldPrice })}
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
