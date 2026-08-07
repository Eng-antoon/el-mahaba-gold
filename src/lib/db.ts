import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { queryOptions } from "@tanstack/react-query";

export type Merchant = Database["public"]["Tables"]["merchants"]["Row"];
export type ItemCategory = Database["public"]["Tables"]["item_categories"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type TxnLine = Database["public"]["Tables"]["transaction_lines"]["Row"];
export type AuditRow = Database["public"]["Tables"]["audit_log"]["Row"];

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

export function transactionQuery(id: string) {
  return queryOptions({
    queryKey: ["transaction", id],
    queryFn: async () =>
      unwrap(
        await supabase.from("transactions").select("*, transaction_lines(*)").eq("id", id).single(),
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

export function merchantBreakdownQuery(id: string) {
  return queryOptions({
    queryKey: ["merchant_breakdown", id],
    queryFn: async () =>
      unwrap(await supabase.rpc("merchant_purity_breakdown", { _merchant_id: id })),
  });
}

export const auditQuery = queryOptions({
  queryKey: ["audit"],
  queryFn: async () =>
    unwrap(
      await supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    ),
});

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
