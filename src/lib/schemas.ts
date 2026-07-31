import { z } from "zod";

export const phoneSchema = z.object({
  imei1: z.string().min(5, "Vui lòng nhập IMEI"),
  brand: z.string().min(1, "Vui lòng nhập hãng"),
  model: z.string().min(1, "Vui lòng nhập model"),
  purchasePrice: z.coerce.number().nonnegative(),
  purchaseDate: z.string().min(1),
  status: z.string().min(1)
});

export const partSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  purchaseCost: z.coerce.number().nonnegative(),
  quantity: z.coerce.number().int().nonnegative(),
  minimumStock: z.coerce.number().int().nonnegative()
});

export const saleSchema = z.object({
  phoneId: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(1),
  salePrice: z.coerce.number().nonnegative(),
  depositAmount: z.coerce.number().nonnegative(),
  saleDate: z.string().min(1),
  saleDateTime: z.string().min(1),
  deliveryStatus: z.enum(["pending_delivery", "delivered", "not_received"])
});
