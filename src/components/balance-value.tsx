import { cn } from "@/lib/utils";
import { directionLabel, fmtGrams, fmtMoney } from "@/lib/gold-math";

/** موجب = عليّ (أحمر) ، سالب = ليّ (أخضر) */
export function BalanceValue({
  value,
  unit,
  className,
  size = "md",
}: {
  value: number;
  unit: "gold" | "cash";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dir = directionLabel(value);
  const text = unit === "gold" ? fmtGrams(value) : fmtMoney(value);
  const color =
    dir === "متساوي" ? "text-muted-foreground" : dir === "عليّ" ? "text-owed" : "text-credit";
  const sizes = { sm: "text-sm", md: "text-lg", lg: "text-2xl sm:text-3xl" }[size];
  return (
    <span className={cn("tnum font-extrabold", color, sizes, className)}>
      {text}
      <span className="ms-1.5 text-[0.7em] font-bold opacity-80">{dir}</span>
    </span>
  );
}

export function DirBadge({ value }: { value: number }) {
  const dir = directionLabel(value);
  return (
    <span
      className={cn(
        "rounded-md px-1.5 py-0.5 text-[11px] font-bold",
        dir === "عليّ"
          ? "bg-owed-soft text-owed"
          : dir === "ليّ"
            ? "bg-credit-soft text-credit"
            : "bg-muted text-muted-foreground",
      )}
    >
      {dir}
    </span>
  );
}
