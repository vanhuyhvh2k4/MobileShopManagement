import type { Expense, Phone, Repair, RepairPart, Sale } from "./types";
import { monthKey, todayISO } from "./utils";

export function phoneCost(
  phone: Phone,
  repairs: Repair[],
  repairParts: RepairPart[],
  expenses: Expense[]
) {
  const labor = repairs
    .filter((repair) => repair.phoneId === phone.id)
    .reduce((sum, repair) => sum + repair.laborCost, 0);
  const repairIds = new Set(repairs.filter((repair) => repair.phoneId === phone.id).map((r) => r.id));
  const parts = repairParts
    .filter((part) => repairIds.has(part.repairId))
    .reduce((sum, part) => sum + part.quantity * part.unitCost, 0);
  const extra = expenses
    .filter((expense) => expense.phoneId === phone.id)
    .reduce((sum, expense) => sum + expense.amount, 0);
  return phone.purchasePrice + (phone.shippingFee ?? 0) + labor + parts + extra;
}

export function saleProfit(
  sale: Sale,
  phones: Phone[],
  repairs: Repair[],
  repairParts: RepairPart[],
  expenses: Expense[]
) {
  if (sale.deliveryStatus === "not_received") return 0;
  const phone = phones.find((item) => item.id === sale.phoneId);
  if (!phone) return 0;
  return sale.salePrice - phoneCost(phone, repairs, repairParts, expenses);
}

export function buildMetrics(args: {
  phones: Phone[];
  repairs: Repair[];
  repairParts: RepairPart[];
  expenses: Expense[];
  sales: Sale[];
  parts: { quantity: number; minimumStock: number }[];
}) {
  const today = todayISO();
  const thisMonth = monthKey(today);
  const effectiveSales = args.sales.filter((sale) => sale.deliveryStatus !== "not_received");
  const salesToday = effectiveSales.filter((sale) => sale.saleDate === today);
  const salesMonth = effectiveSales.filter((sale) => monthKey(sale.saleDate) === thisMonth);
  const profitToday = salesToday.reduce(
    (sum, sale) => sum + saleProfit(sale, args.phones, args.repairs, args.repairParts, args.expenses),
    0
  );
  const profitMonth = salesMonth.reduce(
    (sum, sale) => sum + saleProfit(sale, args.phones, args.repairs, args.repairParts, args.expenses),
    0
  );
  const inventoryValue = args.phones
    .filter((phone) => phone.status !== "Sold")
    .reduce((sum, phone) => sum + phoneCost(phone, args.repairs, args.repairParts, args.expenses), 0);

  return {
    inStock: args.phones.filter((phone) => phone.status !== "Sold").length,
    waitingRepair: args.phones.filter((phone) => phone.status === "Waiting Repair").length,
    ready: args.phones.filter((phone) => phone.status === "Ready For Sale").length,
    soldToday: salesToday.length,
    revenueToday: salesToday.reduce((sum, sale) => sum + sale.salePrice, 0),
    revenueMonth: salesMonth.reduce((sum, sale) => sum + sale.salePrice, 0),
    profitToday,
    profitMonth,
    inventoryValue,
    lowStock: args.parts.filter((part) => part.quantity <= part.minimumStock).length
  };
}

export function monthlySeries(sales: Sale[], phones: Phone[], repairs: Repair[], repairParts: RepairPart[], expenses: Expense[]) {
  const buckets = new Map<string, { month: string; revenue: number; profit: number; sales: number; purchases: number }>();
  for (const sale of sales.filter((item) => item.deliveryStatus !== "not_received")) {
    const key = monthKey(sale.saleDate);
    const bucket = buckets.get(key) ?? { month: key, revenue: 0, profit: 0, sales: 0, purchases: 0 };
    bucket.revenue += sale.salePrice;
    bucket.profit += saleProfit(sale, phones, repairs, repairParts, expenses);
    bucket.sales += 1;
    buckets.set(key, bucket);
  }
  for (const phone of phones) {
    const key = monthKey(phone.purchaseDate);
    const bucket = buckets.get(key) ?? { month: key, revenue: 0, profit: 0, sales: 0, purchases: 0 };
    bucket.purchases += 1;
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
}
