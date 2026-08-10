import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function MerchantRowsSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-border", className)} aria-label="جاري تحميل التجار">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
          <div className="w-24 space-y-2">
            <Skeleton className="ms-auto h-4 w-20" />
            <Skeleton className="ms-auto h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TransactionRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border" aria-label="جاري تحميل الحركات">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-start justify-between gap-4 py-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3.5 w-48 max-w-full" />
            <Skeleton className="h-7 w-52 max-w-full rounded-lg" />
          </div>
          <div className="w-24 space-y-2">
            <Skeleton className="ms-auto h-4 w-20" />
            <Skeleton className="ms-auto h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-5" aria-label="جاري تحميل الصفحة">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    </div>
  );
}

export function QueryError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-xl bg-destructive/5 px-4 py-8 text-center ring-1 ring-destructive/20">
      <p className="text-sm font-bold text-destructive">البيانات ماظهرتش.</p>
      <Button variant="outline" size="sm" className="mt-3 bg-card" onClick={onRetry}>
        حاول تاني
      </Button>
    </div>
  );
}
