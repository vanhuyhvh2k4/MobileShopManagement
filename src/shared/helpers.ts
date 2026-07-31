import type { Part, Phone, Sale } from "../lib/types";

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );
}

export function isPartRecommendedForPhone(part: Part, phone: Phone) {
  const haystack = [part.brand, part.compatibleModels, part.name, part.category].filter(Boolean).join(" ").toLowerCase();
  return [phone.brand, phone.model].filter(Boolean).some((value) => haystack.includes(value.toLowerCase()));
}

export function normalizeCustomerIdentity(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function formatSaleDateTime(sale: Sale) {
  if (!sale.saleDateTime) return sale.saleDate;
  return formatDateTimeText(sale.saleDateTime, sale.saleDate);
}

export function formatDateTimeText(value: string, fallback = value) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace("T", " ");
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    totalPages,
    items: items.slice((safePage - 1) * pageSize, safePage * pageSize)
  };
}
