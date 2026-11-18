import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "Asia/Dubai";

export function formatDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  return new Date(d).toLocaleDateString("en-GB", { timeZone: TZ, ...opts });
}

export function formatDateTime(d: Date | string) {
  return new Date(d).toLocaleString("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeDays(d: Date | string) {
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days < 0) return days === -1 ? "tomorrow" : `in ${-days} days`;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
