import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)]",
        className,
      )}
      aria-label="المحبة للذهب"
    >
      <svg viewBox="0 0 48 48" className="h-8 w-8" aria-hidden="true">
        <path
          d="M10 31.5 15.5 15h17L38 31.5l-6 4.5H16l-6-4.5Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path
          d="M15.5 15 24 25l8.5-10M10 31.5h28"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
        />
        <circle cx="24" cy="25" r="2.2" fill="currentColor" />
      </svg>
    </span>
  );
}
