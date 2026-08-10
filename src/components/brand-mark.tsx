import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/icons/icon-192.png"
      alt="Mahaba Gold"
      width={192}
      height={192}
      className={cn(
        "h-11 w-11 shrink-0 rounded-[14px] object-cover shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)]",
        className,
      )}
    />
  );
}
