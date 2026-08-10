import { useEffect, useState } from "react";
import { CalendarDays, RotateCcw } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { nextRangeSelection } from "@/lib/date-range";
import { useIsMobile } from "@/hooks/use-mobile";

export interface CommittedDateRange {
  from?: string | undefined;
  to?: string | undefined;
}

function fromISO(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year!, month! - 1, day);
}

function toISO(value: Date) {
  return format(value, "yyyy-MM-dd");
}

function formatRange(range: DateRange | undefined) {
  if (!range?.from) return "اختار الفترة";
  if (!range.to) return `${format(range.from, "d MMM yyyy", { locale: ar })} — اختار النهاية`;
  return `${format(range.from, "d MMM yyyy", { locale: ar })} — ${format(range.to, "d MMM yyyy", { locale: ar })}`;
}

export function DateRangePicker({
  value,
  onCommit,
  onClear,
  className,
  disabled,
}: {
  value: CommittedDateRange;
  onCommit: (range: { from: string; to: string }) => void;
  onClear: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<DateRange | undefined>({
    from: fromISO(value.from),
    to: fromISO(value.to),
  });

  useEffect(() => {
    setDraft({ from: fromISO(value.from), to: fromISO(value.to) });
  }, [value.from, value.to]);

  function choose(day: Date) {
    const next = nextRangeSelection(draft, day);
    setDraft(next);
    if (next.from && next.to) {
      onCommit({ from: toISO(next.from), to: toISO(next.to) });
      setOpen(false);
    }
  }

  const trigger = (
    <Button
      variant="outline"
      disabled={disabled}
      className="h-10 min-w-0 flex-1 justify-start gap-2 bg-card px-3 text-start font-bold"
    >
      <CalendarDays className="size-4 shrink-0 text-primary" />
      <bdi dir="ltr" className="truncate">
        {formatRange(draft)}
      </bdi>
    </Button>
  );

  const panel = (
    <>
      <div className="border-b border-border px-4 py-3 pe-11 text-start">
        <p className="text-sm font-extrabold">اختار فترة</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          أول ضغطة من، والثانية إلى. الضغطة التالية تبدأ فترة جديدة.
        </p>
      </div>
      <Calendar
        mode="range"
        selected={draft}
        onDayClick={choose}
        numberOfMonths={1}
        className="mx-auto w-full max-w-[19rem] p-2 [--cell-size:2rem]"
      />
      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const today = new Date();
            setDraft({ from: today, to: today });
            onCommit({ from: toISO(today), to: toISO(today) });
            setOpen(false);
          }}
        >
          النهارده
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const today = new Date();
            const first = new Date(today.getFullYear(), today.getMonth(), 1);
            setDraft({ from: first, to: today });
            onCommit({ from: toISO(first), to: toISO(today) });
            setOpen(false);
          }}
        >
          الشهر ده
        </Button>
      </div>
    </>
  );

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {isMobile ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>{trigger}</DialogTrigger>
          <DialogContent className="w-[calc(100%-1rem)] max-w-[20rem] gap-0 overflow-hidden p-0">
            <DialogTitle className="sr-only">اختيار فترة</DialogTitle>
            {panel}
          </DialogContent>
        </Dialog>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            side="bottom"
            sideOffset={8}
            collisionPadding={12}
            avoidCollisions
            sticky="always"
            className="w-[20rem] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0"
          >
            {panel}
          </PopoverContent>
        </Popover>
      )}
      {value.from || value.to ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0"
          onClick={() => {
            setDraft(undefined);
            onClear();
          }}
          aria-label="مسح الفترة"
        >
          <RotateCcw className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
