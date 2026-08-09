export const MEXICO_CITY_TIME_ZONE = "America/Mexico_City";

export function formatDateMexicoCity(value: Date | string | number | null | undefined): string {
  const date = normalizeDate(value);
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    timeZone: MEXICO_CITY_TIME_ZONE,
    year: "numeric"
  }).format(date);
}

export function formatDateTimeMexicoCity(value: Date | string | number | null | undefined): string {
  const date = normalizeDate(value);
  if (!date) {
    return "";
  }

  const formatted = new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: MEXICO_CITY_TIME_ZONE,
    year: "numeric"
  }).format(date);

  return `${formatted} hrs CDMX`;
}

export function formatTimeMexicoCity(value: Date | string | number | null | undefined): string {
  const date = normalizeDate(value);
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    hour12: true,
    minute: "2-digit",
    timeZone: MEXICO_CITY_TIME_ZONE
  }).format(date);
}

function normalizeDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}
