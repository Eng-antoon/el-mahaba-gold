import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LoadMore({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t border-border pt-4">
      <Button
        variant="outline"
        className="h-11 min-w-40 gap-2 bg-card font-bold"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {loading ? "جاري التحميل" : "عرض المزيد"}
      </Button>
    </div>
  );
}
