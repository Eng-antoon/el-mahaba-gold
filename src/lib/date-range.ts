import type { DateRange } from "react-day-picker";

export function nextRangeSelection(current: DateRange | undefined, day: Date): DateRange {
  if (!current?.from || current.to) return { from: day };
  return day < current.from ? { from: day, to: current.from } : { from: current.from, to: day };
}
