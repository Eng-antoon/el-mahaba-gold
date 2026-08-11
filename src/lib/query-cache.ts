import type { QueryClient } from "@tanstack/react-query";

const LEDGER_QUERY_ROOTS = new Set([
  "audit",
  "balance_summary",
  "balances",
  "merchant_activity_totals",
  "merchant_balance",
  "merchant_directory",
  "merchant_txns",
  "statement",
  "statement_balances",
  "statement_summary",
  "transaction",
]);

export function invalidateLedgerData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) => LEDGER_QUERY_ROOTS.has(String(query.queryKey[0] ?? "")),
  });
}

export function invalidateIdentityData(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === "my_role" ||
      query.queryKey[0] === "profiles" ||
      query.queryKey[0] === "managed_users",
  });
}
