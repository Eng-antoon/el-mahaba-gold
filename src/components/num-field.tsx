import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/** خانة رقمية كبيرة تفتح لوحة أرقام على الموبايل */
export function NumField({
  label,
  value,
  onChange,
  suffix,
  step = "0.01",
  placeholder = "0",
  className,
  autoFocus,
  min = 0,
  max,
}: {
  label: string;
  value: number | "";
  onChange: (v: number) => void;
  suffix?: string;
  step?: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  min?: number;
  max?: number;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-sm font-bold">{label}</Label>
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          autoFocus={autoFocus}
          value={value === 0 ? "" : value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          className="tnum h-14 w-full rounded-xl border border-input bg-card px-4 text-xl font-bold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/30"
          dir="ltr"
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-xs font-bold text-muted-foreground">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}
