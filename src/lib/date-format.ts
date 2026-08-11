const ARABIC_DATE_LOCALE = "ar-EG-u-nu-latn";

export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!dateOnly) return new Date(value);

  return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
}

export function formatArabicDate(value: string | Date): string {
  return new Intl.DateTimeFormat(ARABIC_DATE_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(value));
}

export function formatArabicDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(ARABIC_DATE_LOCALE, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parseLocalDate(value));
}

export function formatArabicDateRange(from?: Date, to?: Date): string {
  if (!from) return "اختار الفترة";
  if (!to) return `${formatArabicDate(from)} — اختار النهاية`;
  return `${formatArabicDate(from)} — ${formatArabicDate(to)}`;
}
