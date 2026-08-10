// @ts-expect-error -- Bun's test module is supplied by the runtime without browser bundle types.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { buildHumanAuditActivity, parseAuditEvents } from "@/lib/audit-activity";
import type { AuditActivity } from "@/lib/db";

const maps = {
  merchants: new Map([["merchant-1", "أحمد للذهب"]]),
  categories: new Map([["category-1", "خواتم"]]),
  users: new Map([["user-1", "توني"]]),
};

function activity(events: unknown[]): AuditActivity {
  return {
    activity_key: "action-1",
    action_id: "action-1",
    actor_id: "user-1",
    created_at: "2026-08-10T12:00:00Z",
    table_names: ["transactions", "transaction_lines"],
    operations: ["INSERT", "UPDATE"],
    events: events as AuditActivity["events"],
  };
}

describe("human-readable audit activities", () => {
  test("groups a transaction and its items into one readable action", () => {
    const row = activity([
      {
        id: 1,
        table_name: "transactions",
        record_id: "transaction-1",
        operation: "INSERT",
        old_data: null,
        new_data: {
          id: "transaction-1",
          merchant_id: "merchant-1",
          kind: "inbound",
          txn_date: "2026-08-10",
          status: "posted",
          total_gold_21: 0,
          total_cash: 0,
        },
        created_at: "2026-08-10T12:00:00Z",
      },
      {
        id: 2,
        table_name: "transaction_lines",
        record_id: "line-1",
        operation: "INSERT",
        old_data: null,
        new_data: {
          transaction_id: "transaction-1",
          category_id: "category-1",
          label: "خواتم",
          kind: "inbound",
          purity: 875,
          weight: 10,
          weight_21: 10,
          cash_amount: 2000,
        },
        created_at: "2026-08-10T12:00:00Z",
      },
      {
        id: 3,
        table_name: "transactions",
        record_id: "transaction-1",
        operation: "UPDATE",
        old_data: { total_gold_21: 0, total_cash: 0 },
        new_data: {
          id: "transaction-1",
          merchant_id: "merchant-1",
          kind: "inbound",
          txn_date: "2026-08-10",
          status: "posted",
          total_gold_21: 10,
          total_cash: 2000,
        },
        created_at: "2026-08-10T12:00:00Z",
      },
    ]);

    const human = buildHumanAuditActivity(row, maps);
    expect(human.title).toBe("أنشأ حركة وارد");
    expect(human.description).toBe("أحمد للذهب");
    expect(human.lines).toHaveLength(1);
    expect(human.lines[0]?.title).toContain("إضافة بند وارد — خواتم");
  });

  test("describes cancellation and exposes its reason", () => {
    const row = activity([
      {
        id: 4,
        table_name: "transactions",
        record_id: "transaction-1",
        operation: "UPDATE",
        old_data: { merchant_id: "merchant-1", kind: "settlement", status: "posted" },
        new_data: {
          merchant_id: "merchant-1",
          kind: "settlement",
          status: "voided",
          void_reason: "الحركة اتسجلت مرتين",
        },
        created_at: "2026-08-10T12:00:00Z",
      },
    ]);

    const human = buildHumanAuditActivity(row, maps);
    expect(human.title).toBe("ألغى حركة تسديد");
    expect(human.changes.some((change) => change.label === "سبب الإلغاء")).toBe(true);
  });

  test("rejects malformed JSON event values", () => {
    expect(parseAuditEvents({ invalid: true })).toEqual([]);
  });
});

describe("grouped audit migration contract", () => {
  const sql = readFileSync(
    "supabase/migrations/20260810185633_grouped_audit_activities.sql",
    "utf8",
  );

  test("uses action correlation, actor filtering, and invoker security", () => {
    expect(sql).toContain("action_id UUID");
    expect(sql).toContain("_actor_id UUID DEFAULT NULL");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.visible_audit_activity");
  });

  test("does not suppress voided transaction events", () => {
    expect(sql).not.toContain("t.status = 'voided'");
  });
});
