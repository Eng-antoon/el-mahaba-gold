import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

export type Merchant = Database["public"]["Tables"]["merchants"]["Row"];
export type ItemCategory = Database["public"]["Tables"]["item_categories"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type TxnLine = Database["public"]["Tables"]["transaction_lines"]["Row"];
export type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];
export type AuditActivity =
  Database["public"]["Functions"]["visible_audit_activity"]["Returns"][number];
export type MerchantDirectoryRow =
  Database["public"]["Functions"]["merchant_directory"]["Returns"][number];

export const PAGE_SIZE = 20;

function paged<T>(rows: T[], offset: number) {
  const hasMore = rows.length > PAGE_SIZE;
  return {
    rows: rows.slice(0, PAGE_SIZE),
    nextOffset: hasMore ? offset + PAGE_SIZE : undefined,
  };
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const merchantsQuery = queryOptions({
  queryKey: ["merchants"],
  queryFn: async () =>
    unwrap(
      await supabase
        .from("merchants")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true }),
    ),
});

export const balancesQuery = queryOptions({
  queryKey: ["balances"],
  queryFn: async () => unwrap(await supabase.rpc("merchant_balances")),
});

export function merchantBalanceQuery(id: string) {
  return queryOptions({
    queryKey: ["merchant_balance", id],
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc("merchant_balances").eq("merchant_id", id).limit(1));
      return rows[0] ?? null;
    },
  });
}

export const balanceSummaryQuery = queryOptions({
  queryKey: ["balance_summary"],
  queryFn: async () => {
    const rows = unwrap(await supabase.rpc("merchant_balance_summary"));
    return rows[0] ?? { gold_owed: 0, gold_credit: 0, cash_owed: 0, cash_credit: 0 };
  },
});

export function merchantDirectoryInfiniteQuery({
  search = "",
  type = null,
  sort = "name",
}: {
  search?: string;
  type?: Database["public"]["Enums"]["merchant_type"] | null;
  sort?: "name" | "exposure" | "recent";
}) {
  return infiniteQueryOptions({
    queryKey: ["merchant_directory", search, type ?? "all", sort],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = unwrap(
        await supabase
          .rpc("merchant_directory", {
            _search: search.trim() || null,
            _type: type,
            _sort: sort,
          })
          .range(pageParam, pageParam + PAGE_SIZE),
      );
      return paged(rows, pageParam);
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () =>
    unwrap(
      await supabase
        .from("item_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ),
});

export function merchantQuery(id: string) {
  return queryOptions({
    queryKey: ["merchant", id],
    queryFn: async () =>
      unwrap(
        await supabase.from("merchants").select("*").eq("id", id).single(),
      ) as unknown as Merchant,
  });
}

export function merchantTxnsQuery(id: string) {
  return queryOptions({
    queryKey: ["merchant_txns", id],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("transactions")
          .select(
            "*, transaction_lines(*), merchant:merchants!transactions_merchant_id_fkey(name), counterparty:merchants!transactions_counterparty_merchant_id_fkey(name)",
          )
          .eq("status", "posted")
          .or(`merchant_id.eq.${id},counterparty_merchant_id.eq.${id}`)
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false }),
      ) as unknown as (Transaction & {
        transaction_lines: TxnLine[];
        merchant: { name: string } | null;
        counterparty: { name: string } | null;
      })[],
  });
}

export type MerchantTransaction = Transaction & {
  transaction_lines: TxnLine[];
  merchant: { name: string } | null;
  counterparty: { name: string } | null;
};

export function merchantTxnsInfiniteQuery(id: string, from?: string, to?: string) {
  return infiniteQueryOptions({
    queryKey: ["merchant_txns", id, from ?? "", to ?? ""],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("transactions")
        .select(
          "*, transaction_lines(*), merchant:merchants!transactions_merchant_id_fkey(name), counterparty:merchants!transactions_counterparty_merchant_id_fkey(name)",
        )
        .eq("status", "posted")
        .or(`merchant_id.eq.${id},counterparty_merchant_id.eq.${id}`);
      if (from) query = query.gte("txn_date", from);
      if (to) query = query.lte("txn_date", to);
      const rows = unwrap(
        await query
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .range(pageParam, pageParam + PAGE_SIZE),
      ) as unknown as MerchantTransaction[];
      return paged(rows, pageParam);
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

export function merchantActivityTotalsQuery(id: string, from?: string, to?: string) {
  return queryOptions({
    queryKey: ["merchant_activity_totals", id, from ?? "", to ?? ""],
    queryFn: async () => {
      const rows = unwrap(
        await supabase.rpc("merchant_activity_totals", {
          _merchant_id: id,
          ...(from ? { _from: from } : {}),
          ...(to ? { _to: to } : {}),
        }),
      );
      return rows[0] ?? { gold: 0, cash: 0 };
    },
  });
}

export function transactionQuery(id: string) {
  return queryOptions({
    queryKey: ["transaction", id],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("transactions")
          .select("*, transaction_lines(*)")
          .eq("id", id)
          .eq("status", "posted")
          .single(),
      ) as unknown as Transaction & { transaction_lines: TxnLine[] },
  });
}

export function statementQuery(merchantId: string | null, from?: string, to?: string) {
  return queryOptions({
    queryKey: ["statement", merchantId, from ?? "", to ?? ""],
    enabled: Boolean(merchantId),
    queryFn: async () =>
      unwrap(
        await supabase.rpc("merchant_statement", {
          _merchant_id: merchantId!,
          ...(from ? { _from: from } : {}),
          ...(to ? { _to: to } : {}),
        }),
      ),
  });
}

export function statementInfiniteQuery(merchantId: string | null, from?: string, to?: string) {
  return infiniteQueryOptions({
    queryKey: ["statement", merchantId, from ?? "", to ?? "", "paged"],
    enabled: Boolean(merchantId),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = unwrap(
        await supabase
          .rpc("merchant_statement", {
            _merchant_id: merchantId!,
            ...(from ? { _from: from } : {}),
            ...(to ? { _to: to } : {}),
          })
          .order("txn_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("transaction_id", { ascending: false })
          .range(pageParam, pageParam + PAGE_SIZE),
      );
      return paged(rows, pageParam);
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

export function statementBalancesQuery(merchantId: string | null, from?: string, to?: string) {
  return queryOptions({
    queryKey: ["statement_balances", merchantId, from ?? "", to ?? ""],
    enabled: Boolean(merchantId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase.rpc("merchant_statement_balances", {
          _merchant_id: merchantId!,
          ...(from ? { _from: from } : {}),
          ...(to ? { _to: to } : {}),
        }),
      );
      return (
        rows[0] ?? {
          opening_gold: 0,
          opening_cash: 0,
          period_gold: 0,
          period_cash: 0,
          closing_gold: 0,
          closing_cash: 0,
        }
      );
    },
  });
}

export function statementSummaryQuery(merchantId: string | null, from?: string, to?: string) {
  return queryOptions({
    queryKey: ["statement_summary", merchantId, from ?? "", to ?? ""],
    enabled: Boolean(merchantId),
    queryFn: async () => {
      const rows = unwrap(
        await supabase.rpc("merchant_statement_summary", {
          _merchant_id: merchantId!,
          ...(from ? { _from: from } : {}),
          ...(to ? { _to: to } : {}),
        }),
      );
      return (
        rows[0] ?? {
          total_bullion_received_21: 0,
          total_jewelry_received_21: 0,
          total_cash_paid: 0,
          total_cash_received: 0,
          total_scrap_paid_21: 0,
        }
      );
    },
  });
}

export function merchantBreakdownQuery(id: string) {
  return queryOptions({
    queryKey: ["merchant_breakdown", id],
    queryFn: async () =>
      unwrap(await supabase.rpc("merchant_purity_breakdown", { _merchant_id: id })),
  });
}

export const auditQuery = queryOptions({
  queryKey: ["audit"],
  queryFn: async () => {
    const [rows, voidedTransactions] = await Promise.all([
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("transactions").select("id").eq("status", "voided"),
    ]);
    const auditRows = unwrap(rows);
    const hiddenTransactionIds = new Set(unwrap(voidedTransactions).map((row) => row.id));

    return auditRows.filter((row) => {
      if (row.table_name === "transactions") {
        return !row.record_id || !hiddenTransactionIds.has(row.record_id);
      }
      if (row.table_name !== "transaction_lines") return true;
      const oldData = asJsonObject(row.old_data);
      const newData = asJsonObject(row.new_data);
      const transactionId = String(
        newData?.["transaction_id"] ?? oldData?.["transaction_id"] ?? "",
      );
      return !hiddenTransactionIds.has(transactionId);
    });
  },
});

export function auditInfiniteQuery({
  table,
  operation,
  from,
  to,
  actorId,
}: {
  table?: string | undefined;
  operation?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  actorId?: string | undefined;
}) {
  return infiniteQueryOptions({
    queryKey: [
      "audit",
      "activities",
      table ?? "all",
      operation ?? "all",
      actorId ?? "all",
      from ?? "",
      to ?? "",
    ],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const rows = unwrap(
        await supabase
          .rpc("visible_audit_activity", {
            _actor_id: actorId || null,
            _table_name: table || null,
            _operation: operation || null,
            _from: from || null,
            _to: to || null,
          })
          .range(pageParam, pageParam + PAGE_SIZE),
      );
      return paged(rows, pageParam);
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
  });
}

function asJsonObject(value: Database["public"]["Tables"]["audit_log"]["Row"]["old_data"]) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

export const profilesQuery = queryOptions({
  queryKey: ["profiles"],
  queryFn: async () => {
    const profiles = unwrap(
      await supabase.from("profiles").select("*").order("created_at", { ascending: true }),
    );
    const roles = unwrap(await supabase.from("user_roles").select("*"));
    return profiles.map((p) => ({
      ...p,
      roles: roles.filter((r) => r.user_id === p.id).map((r) => r.role),
    }));
  },
});

export const myRoleQuery = queryOptions({
  queryKey: ["my_role"],
  queryFn: async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return { userId: null, isAdmin: false, name: "" };
    const roles = unwrap(await supabase.from("user_roles").select("role").eq("user_id", uid));
    const profile = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
    return {
      userId: uid,
      isAdmin: roles.some((r) => r.role === "admin"),
      name: profile.data?.full_name || userData.user?.email || "",
    };
  },
});
