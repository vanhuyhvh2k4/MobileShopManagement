import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function currency(value: number, currencyCode = "VND") {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowLocalDateTime() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
