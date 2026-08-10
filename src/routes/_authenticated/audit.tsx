import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { History, UserRound } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { auditInfiniteQuery, categoriesQuery, merchantsQuery, profilesQuery } from "@/lib/db";
import { fmtDateTime } from "@/lib/gold-math";
import { buildHumanAuditActivity } from "@/lib/audit-activity";
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
import { DateRangePicker } from "@/components/date-range-picker";
import { LoadMore } from "@/components/load-more";
import { QueryError, TransactionRowsSkeleton } from "@/components/loading-states";

const searchSchema = z.object({
  table: z.string().optional(),
  operation: z.string().optional(),
  actor: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/audit")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "سجل النشاط — Mahaba Gold" }] }),
  component: AuditPage,
});

function AuditPage() {
  const search = useSearch({ from: "/_authenticated/audit" });
  const navigate = useNavigate();
  const audit = useInfiniteQuery(
    auditInfiniteQuery({
      table: search.table,
      operation: search.operation,
      actorId: search.actor,
      from: search.from,
      to: search.to,
    }),
  );
  const rows = audit.data?.pages.flatMap((page) => page.rows) ?? [];
  const { data: profiles = [] } = useQuery(profilesQuery);
  const { data: merchants = [] } = useQuery(merchantsQuery);
  const { data: categories = [] } = useQuery(categoriesQuery);
  const table = search.table ?? "all";
  const operation = search.operation ?? "all";
  const actor = search.actor ?? "all";
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name || "مستخدم"]));
  const lookupMaps = {
    users: names,
    merchants: new Map(merchants.map((merchant) => [merchant.id, merchant.name])),
    categories: new Map(categories.map((category) => [category.id, category.name_ar])),
  };

  function setFilters(patch: Partial<typeof search>) {
    navigate({ to: "/audit", search: { ...search, ...patch }, replace: true });
  }

  return (
    <AppShell title="سجل النشاط">
      <div className="grid gap-3 border-b border-border pb-5 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.4fr]">
        <Select
          value={actor}
          onValueChange={(value) => setFilters({ actor: value === "all" ? undefined : value })}
        >
          <SelectTrigger className="h-10 bg-card">
            <UserRound className="size-4 text-primary" />
            <SelectValue placeholder="كل المستخدمين" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المستخدمين</SelectItem>
            {profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.full_name || "مستخدم"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={table}
          onValueChange={(value) => setFilters({ table: value === "all" ? undefined : value })}
        >
          <SelectTrigger className="h-10 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل أنواع النشاط</SelectItem>
            <SelectItem value="transactions">الحركات</SelectItem>
            <SelectItem value="merchants">التجار</SelectItem>
            <SelectItem value="transaction_lines">بنود الحركات</SelectItem>
            <SelectItem value="item_categories">الأصناف</SelectItem>
            <SelectItem value="user_roles">صلاحيات المستخدمين</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={operation}
          onValueChange={(value) => setFilters({ operation: value === "all" ? undefined : value })}
        >
          <SelectTrigger className="h-10 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل العمليات</SelectItem>
            <SelectItem value="INSERT">إضافة</SelectItem>
            <SelectItem value="UPDATE">تعديل</SelectItem>
            <SelectItem value="DELETE">حذف</SelectItem>
          </SelectContent>
        </Select>
        <DateRangePicker
          className="sm:col-span-2 xl:col-span-1"
          value={search}
          onCommit={(range) => setFilters(range)}
          onClear={() => setFilters({ from: undefined, to: undefined })}
        />
      </div>

      {audit.isLoading ? (
        <TransactionRowsSkeleton count={6} />
      ) : audit.isError ? (
        <QueryError onRetry={() => audit.refetch()} />
      ) : (
        <Accordion type="multiple" className="divide-y divide-border">
          {rows.map((row) => {
            const activity = buildHumanAuditActivity(row, lookupMaps);
            return (
              <AccordionItem key={row.activity_key} value={row.activity_key} className="border-0">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="flex min-w-0 items-start gap-3 text-start">
                    <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary">
                      <History className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-extrabold">{activity.title}</p>
                      {activity.description ? (
                        <p className="truncate text-xs font-bold text-foreground/70">
                          {activity.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs font-normal text-muted-foreground">
                        <bdi dir="ltr">{fmtDateTime(row.created_at)}</bdi>
                        <span> · </span>
                        {row.actor_id ? (names.get(row.actor_id) ?? "مستخدم") : "النظام"}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pb-4 ps-12">
                    {activity.changes.length ? (
                      <div className="divide-y divide-border rounded-xl bg-muted/55 px-3">
                        {activity.changes.map((change) => (
                          <div
                            key={`${row.activity_key}-${change.label}`}
                            className="grid gap-1 py-2.5 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center"
                          >
                            <span className="font-bold text-muted-foreground">{change.label}</span>
                            <span className="min-w-0 font-semibold">
                              {change.before !== undefined && change.after !== undefined ? (
                                <>
                                  <span className="text-muted-foreground line-through">
                                    {change.before}
                                  </span>
                                  <span className="mx-2 text-muted-foreground">←</span>
                                  <span>{change.after}</span>
                                </>
                              ) : (
                                (change.after ?? change.before)
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {activity.lines.length ? (
                      <div className="space-y-2">
                        {activity.lines.map((line) => (
                          <div key={line.key} className="border-s-2 border-primary/35 ps-3">
                            <p className="text-sm font-extrabold">{line.title}</p>
                            <p className="tnum mt-1 text-xs font-semibold text-muted-foreground">
                              {line.values.join(" · ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {!activity.changes.length && !activity.lines.length ? (
                      <p className="text-sm text-muted-foreground">
                        تم تسجيل النشاط بدون تفاصيل إضافية.
                      </p>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
      {audit.isFetchingNextPage ? <TransactionRowsSkeleton count={2} /> : null}
      {!audit.isLoading && rows.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">مافيش نشاط مطابق.</div>
      ) : null}
      <LoadMore
        hasMore={Boolean(audit.hasNextPage)}
        loading={audit.isFetchingNextPage}
        onClick={() => audit.fetchNextPage()}
      />
    </AppShell>
  );
}
