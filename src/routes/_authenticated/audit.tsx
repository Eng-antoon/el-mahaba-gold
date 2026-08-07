import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { auditQuery, profilesQuery } from "@/lib/db";
import { fmtDateTime } from "@/lib/gold-math";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "سجل التعديلات — المحبة للذهب" }] }),
  component: AuditPage,
});

const TABLE_LABELS: Record<string, string> = {
  transactions: "حركة",
  transaction_lines: "بند حركة",
  merchants: "تاجر",
  item_categories: "صنف",
  user_roles: "صلاحية مستخدم",
};
const OP_LABELS: Record<string, string> = { INSERT: "إضافة", UPDATE: "تعديل", DELETE: "حذف" };

function AuditPage() {
  const { data: rows = [], isLoading } = useQuery(auditQuery);
  const { data: profiles = [] } = useQuery(profilesQuery);
  const [table, setTable] = useState("all");
  const [operation, setOperation] = useState("all");
  const [date, setDate] = useState("");
  const names = new Map(profiles.map((p) => [p.id, p.full_name || "مستخدم"]));
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (table === "all" || r.table_name === table) &&
          (operation === "all" || r.operation === operation) &&
          (!date || r.created_at.slice(0, 10) === date),
      ),
    [rows, table, operation, date],
  );

  return (
    <AppShell title="سجل التعديلات">
      <div className="grid gap-3 border-b border-border pb-5 sm:grid-cols-3">
        <Select value={table} onValueChange={setTable}>
          <SelectTrigger className="h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل السجلات</SelectItem>
            <SelectItem value="transactions">الحركات</SelectItem>
            <SelectItem value="merchants">التجار</SelectItem>
            <SelectItem value="transaction_lines">بنود الحركات</SelectItem>
          </SelectContent>
        </Select>
        <Select value={operation} onValueChange={setOperation}>
          <SelectTrigger className="h-11 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العمليات</SelectItem>
            <SelectItem value="INSERT">إضافة</SelectItem>
            <SelectItem value="UPDATE">تعديل</SelectItem>
            <SelectItem value="DELETE">حذف</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          dir="ltr"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 bg-card"
        />
      </div>
      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground">جاري التحميل...</div>
      ) : (
        <Accordion type="multiple" className="divide-y divide-border">
          {filtered.map((row) => (
            <AccordionItem key={row.id} value={String(row.id)} className="border-0">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="min-w-0 text-start">
                  <p className="font-extrabold">
                    {OP_LABELS[row.operation] ?? row.operation}{" "}
                    {TABLE_LABELS[row.table_name] ?? row.table_name}
                  </p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {fmtDateTime(row.created_at)} ·{" "}
                    {row.actor_id ? (names.get(row.actor_id) ?? "مستخدم") : "النظام"}
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-3 pb-4 md:grid-cols-2">
                  {row.old_data ? <JsonBlock title="قبل" value={row.old_data} /> : null}
                  {row.new_data ? <JsonBlock title="بعد" value={row.new_data} /> : null}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      {!isLoading && filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">مافيش سجلات مطابقة.</div>
      ) : null}
    </AppShell>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted p-3">
      <p className="mb-2 text-xs font-bold text-muted-foreground">{title}</p>
      <pre
        dir="ltr"
        className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
