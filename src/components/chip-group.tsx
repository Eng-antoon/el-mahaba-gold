import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** أزرار اختيار سريعة بدل القوائم المنسدلة — أسهل على الموبايل */
export function ChipGroup<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className,
  columns,
}: {
  label?: string;
  value: T | null | undefined;
  options: { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
  className?: string;
  columns?: number;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {label ? <Label className="text-sm font-bold">{label}</Label> : null}
      <div
        className={cn("flex flex-wrap gap-2", columns && "grid")}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))` } : undefined}
      >
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                "min-h-11 rounded-xl border px-3.5 py-2 text-sm font-bold transition-all active:scale-[0.97]",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent/40",
              )}
            >
              {o.label}
              {o.hint ? (
                <span className="tnum ms-1 text-[11px] font-semibold opacity-70">{o.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
