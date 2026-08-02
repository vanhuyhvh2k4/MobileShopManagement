import type { Part, PartImport, Phone } from "../lib/types";
import { nowLocalDateTime, todayISO, uid } from "../lib/utils";

export const blankPhone = (): Phone => ({
  id: uid("phone"),
  imei1: "",
  brand: "",
  model: "",
  purchasePrice: 0,
  purchaseDeposit: 0,
  shippingFee: 0,
  purchaseDate: todayISO(),
  status: "Purchased",
  updatedAt: new Date().toISOString()
});

export const blankPart = (): Part => ({
  id: uid("part"),
  brand: "",
  name: "",
  category: "",
  purchaseCost: 0,
  quantity: 0,
  minimumStock: 1
});

export const blankPartImport = (part: Part): PartImport => ({
  id: uid("partimport"),
  partId: part.id,
  quantity: 1,
  unitCost: part.purchaseCost,
  importDateTime: nowLocalDateTime(),
  supplier: part.supplier,
  notes: "",
  status: "importing"
});
