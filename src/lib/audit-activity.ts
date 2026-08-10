import type { Json } from "@/integrations/supabase/types";
import type { AuditActivity } from "@/lib/db";
import { fmtDate, fmtGrams, fmtMoney, KIND_SHORT, METHOD_LABELS, PURITIES } from "@/lib/gold-math";

export interface AuditEvent {
  id: number;
  table_name: string;
  record_id: string | null;
  operation: string;
  old_data: Record<string, Json> | null;
  new_data: Record<string, Json> | null;
  created_at: string;
}

export interface AuditLookupMaps {
  merchants: Map<string, string>;
  categories: Map<string, string>;
  users: Map<string, string>;
}

export interface AuditChange {
  label: string;
  before?: string;
  after?: string;
}

export interface AuditLineDetail {
  key: string;
  title: string;
  values: string[];
}

export interface HumanAuditActivity {
  title: string;
  description?: string;
  changes: AuditChange[];
  lines: AuditLineDetail[];
}

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  name_ar: "اسم الصنف",
  phone: "رقم الهاتف",
  merchant_type: "نوع التاجر",
  merchant_id: "التاجر",
  counterparty_merchant_id: "التاجر المحوّل له",
  kind: "نوع الحركة",
  txn_date: "التاريخ",
  notes: "الملاحظات",
  status: "الحالة",
  void_reason: "سبب الإلغاء",
  total_gold_21: "إجمالي الذهب",
  total_cash: "إجمالي النقدية",
  label: "النوع المحدد",
  method: "طريقة التسديد",
  purity: "العيار",
  weight: "الوزن",
  pieces: "العدد",
  rate_per_gram: "القيمة للجرام",
  gold_price_per_gram: "سعر جرام الذهب",
  cash_amount: "المبلغ النقدي",
  gold_delta: "أثر الذهب",
  cash_delta: "أثر النقدية",
  role: "الصلاحية",
  user_id: "المستخدم",
  scope: "نوع الصنف",
  tracks_count: "يتابع العدد",
  fixed_weight: "الوزن الثابت",
  fixed_purity: "العيار الثابت",
  is_active: "الحالة",
};

const IMPORTANT_FIELDS: Record<string, string[]> = {
  transactions: [
    "merchant_id",
    "counterparty_merchant_id",
    "kind",
    "txn_date",
    "notes",
    "status",
    "void_reason",
    "total_gold_21",
    "total_cash",
  ],
  merchants: ["name", "merchant_type", "phone", "is_active"],
  item_categories: [
    "name_ar",
    "scope",
    "tracks_count",
    "fixed_weight",
    "fixed_purity",
    "is_active",
  ],
  user_roles: ["user_id", "role"],
};

function objectValue(value: Json | null | undefined): Record<string, Json> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : null;
}

export function parseAuditEvents(value: Json): AuditEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const row = objectValue(candidate);
    if (!row || typeof row["table_name"] !== "string" || typeof row["operation"] !== "string")
      return [];
    return [
      {
        id: Number(row["id"] ?? 0),
        table_name: row["table_name"],
        record_id: typeof row["record_id"] === "string" ? row["record_id"] : null,
        operation: row["operation"],
        old_data: objectValue(row["old_data"]),
        new_data: objectValue(row["new_data"]),
        created_at: typeof row["created_at"] === "string" ? row["created_at"] : "",
      },
    ];
  });
}

function text(value: Json | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function purityLabel(value: Json | undefined) {
  const numeric = Number(value);
  return PURITIES.find((purity) => purity.value === numeric)?.label ?? `عيار ${text(value)}`;
}

function kindLabel(value: Json | undefined) {
  const key = String(value ?? "") as keyof typeof KIND_SHORT;
  return KIND_SHORT[key] ?? text(value);
}

function methodLabel(value: Json | undefined) {
  const key = String(value ?? "") as keyof typeof METHOD_LABELS;
  return METHOD_LABELS[key] ?? text(value);
}

function merchantName(value: Json | undefined, maps: AuditLookupMaps) {
  return maps.merchants.get(String(value ?? "")) ?? "تاجر";
}

function formatField(field: string, value: Json | undefined, maps: AuditLookupMaps) {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "merchant_id" || field === "counterparty_merchant_id") {
    return merchantName(value, maps);
  }
  if (field === "user_id") return maps.users.get(String(value)) ?? "مستخدم";
  if (field === "kind") return kindLabel(value);
  if (field === "method") return methodLabel(value);
  if (field === "purity" || field === "fixed_purity") return purityLabel(value);
  if (field === "txn_date") return fmtDate(String(value));
  if (
    field === "total_gold_21" ||
    field === "gold_delta" ||
    field === "weight" ||
    field === "fixed_weight"
  ) {
    return fmtGrams(Number(value));
  }
  if (
    field === "total_cash" ||
    field === "cash_delta" ||
    field === "cash_amount" ||
    field === "rate_per_gram" ||
    field === "gold_price_per_gram"
  ) {
    return fmtMoney(Number(value));
  }
  if (field === "merchant_type" || field === "scope") {
    return value === "raw" ? "خام" : "مشغولات";
  }
  if (field === "status") return value === "voided" ? "ملغاة" : "مرحّلة";
  if (field === "role") return value === "admin" ? "مدير" : "مستخدم";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  return text(value);
}

function changedFields(
  table: string,
  before: Record<string, Json> | null,
  after: Record<string, Json> | null,
  maps: AuditLookupMaps,
) {
  return (IMPORTANT_FIELDS[table] ?? []).flatMap((field) => {
    const oldValue = before?.[field];
    const newValue = after?.[field];
    if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) return [];
    return [
      {
        label: FIELD_LABELS[field] ?? field,
        ...(before ? { before: formatField(field, oldValue, maps) } : {}),
        ...(after ? { after: formatField(field, newValue, maps) } : {}),
      },
    ];
  });
}

function finalData(events: AuditEvent[], table: string) {
  const scoped = events.filter((event) => event.table_name === table);
  return scoped.at(-1)?.new_data ?? scoped.at(-1)?.old_data ?? null;
}

function firstData(events: AuditEvent[], table: string) {
  const scoped = events.filter((event) => event.table_name === table);
  return scoped[0]?.old_data ?? null;
}

function lineDetail(event: AuditEvent, index: number, maps: AuditLookupMaps): AuditLineDetail {
  const row = event.new_data ?? event.old_data ?? {};
  const operation =
    event.operation === "DELETE" ? "حذف" : event.operation === "UPDATE" ? "تعديل" : "إضافة";
  const specific =
    row["method"] != null
      ? methodLabel(row["method"])
      : text(row["label"]) !== "—"
        ? text(row["label"])
        : (maps.categories.get(String(row["category_id"] ?? "")) ?? "بند");
  const titleKind = row["is_return"] === true ? "مرتجع" : kindLabel(row["kind"]);
  const values: string[] = [purityLabel(row["purity"])];
  if (Number(row["weight"] ?? 0) !== 0) values.push(fmtGrams(Number(row["weight"])));
  if (Number(row["weight_21"] ?? 0) !== 0 && Number(row["weight_21"]) !== Number(row["weight"])) {
    values.push(`يعادل ${fmtGrams(Number(row["weight_21"]))} عيار 21`);
  }
  if (Number(row["pieces"] ?? 0) !== 0) values.push(`${Number(row["pieces"])} قطعة`);
  if (Number(row["cash_amount"] ?? 0) !== 0) {
    values.push(fmtMoney(Number(row["cash_amount"])));
  }
  return {
    key: `${event.id}-${index}`,
    title: `${operation} بند ${titleKind} — ${specific}`,
    values,
  };
}

export function buildHumanAuditActivity(
  activity: AuditActivity,
  maps: AuditLookupMaps,
): HumanAuditActivity {
  const events = parseAuditEvents(activity.events);
  const transactionEvents = events.filter((event) => event.table_name === "transactions");
  const transaction = finalData(events, "transactions");
  const transactionBefore = firstData(events, "transactions");
  const merchant = finalData(events, "merchants");
  const category = finalData(events, "item_categories");
  const role = finalData(events, "user_roles");
  const wasInserted = transactionEvents.some((event) => event.operation === "INSERT");
  const wasVoided =
    transactionBefore?.["status"] !== "voided" && transaction?.["status"] === "voided";
  const isSettlement = transaction?.["is_account_settlement"] === true;
  const merchantLabel = transaction ? merchantName(transaction["merchant_id"], maps) : undefined;

  let title = "تغيير في النظام";
  let description: string | undefined;
  let changes: AuditChange[] = [];

  if (transaction) {
    const movement = kindLabel(transaction["kind"]);
    if (wasVoided) title = `ألغى حركة ${movement}`;
    else if (isSettlement && wasInserted) title = `صفّى حساب ${merchantLabel}`;
    else if (wasInserted) title = `أنشأ حركة ${movement}`;
    else title = `عدّل حركة ${movement}`;
    description = merchantLabel;
    changes = changedFields("transactions", transactionBefore, transaction, maps);
  } else if (merchant) {
    const event = events.find((candidate) => candidate.table_name === "merchants");
    const operation =
      event?.operation === "INSERT" ? "أضاف" : event?.operation === "DELETE" ? "حذف" : "عدّل";
    title = `${operation} بيانات التاجر ${text(merchant["name"])}`;
    changes = changedFields("merchants", firstData(events, "merchants"), merchant, maps);
  } else if (category) {
    const event = events.find((candidate) => candidate.table_name === "item_categories");
    const operation =
      event?.operation === "INSERT" ? "أضاف" : event?.operation === "DELETE" ? "حذف" : "عدّل";
    title = `${operation} الصنف ${text(category["name_ar"])}`;
    changes = changedFields(
      "item_categories",
      firstData(events, "item_categories"),
      category,
      maps,
    );
  } else if (role) {
    const event = events.find((candidate) => candidate.table_name === "user_roles");
    const operation = event?.operation === "DELETE" ? "أزال صلاحية" : "غيّر صلاحية";
    const user = maps.users.get(String(role["user_id"] ?? "")) ?? "مستخدم";
    title = `${operation} ${user}`;
    changes = changedFields("user_roles", firstData(events, "user_roles"), role, maps);
  }

  const insertedLines = events.filter(
    (event) => event.table_name === "transaction_lines" && event.operation === "INSERT",
  );
  const relevantLines = transaction
    ? insertedLines
    : events.filter((event) => event.table_name === "transaction_lines");

  return {
    title,
    ...(description ? { description } : {}),
    changes,
    lines: relevantLines.map((event, index) => lineDetail(event, index, maps)),
  };
}
