import { supabase } from "./supabase";
import type { AppLog, BackupPayload, Customer, DeletedRow, Expense, Part, PartImport, Phone, PhoneFault, Repair, RepairPart, Sale, Settings } from "./types";

const selectAll = async <T>(table: string) => {
  if (!supabase) return [] as T[];
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return (data ?? []) as T[];
};

const selectActive = async <T>(table: string) => {
  if (!supabase) return [] as T[];
  const { data, error } = await supabase.from(table).select("*").is("deleted_at", null);
  if (error) throw error;
  return (data ?? []) as T[];
};

const upsertRow = async (table: string, row: Record<string, unknown>) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).upsert(row);
  if (error) throw error;
};

const upsertRows = async (table: string, rows: Record<string, unknown>[]) => {
  if (!supabase || rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows);
  if (error) throw error;
};

export const deleteRemoteRow = async (table: string, id: string) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
};

export const softDeleteRemoteRow = async (table: string, id: string) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
};

export const restoreRemoteRow = async (table: string, id: string) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).update({ deleted_at: null }).eq("id", id);
  if (error) throw error;
};

export const deleteRemoteWhere = async (table: string, column: string, value: string) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).delete().eq(column, value);
  if (error) throw error;
};

export const softDeleteRemoteWhere = async (table: string, column: string, value: string) => {
  if (!supabase) return;
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq(column, value);
  if (error) throw error;
};

export const phoneToRow = (phone: Phone) => ({
  id: phone.id,
  imei1: phone.imei1,
  imei2: phone.imei2 ?? null,
  brand: phone.brand,
  model: phone.model,
  color: phone.color ?? null,
  storage: phone.storage ?? null,
  ram: phone.ram ?? null,
  carrier: phone.carrier ?? null,
  accessories: phone.accessories ?? null,
  seller_name: phone.sellerName ?? null,
  seller_phone: phone.sellerPhone ?? null,
  purchase_price: phone.purchasePrice,
  purchase_deposit: phone.purchaseDeposit ?? 0,
  shipping_fee: phone.shippingFee ?? 0,
  purchase_date: phone.purchaseDate,
  status: phone.status,
  notes: phone.notes ?? null,
  image_front: phone.imageFront ?? null,
  image_back: phone.imageBack ?? null,
  image_imei: phone.imageImei ?? null,
  image_accessories: phone.imageAccessories ?? null,
  updated_at: phone.updatedAt
});

const rowToPhone = (row: Record<string, unknown>): Phone => ({
  id: String(row.id),
  imei1: String(row.imei1 ?? ""),
  imei2: row.imei2 ? String(row.imei2) : undefined,
  brand: String(row.brand ?? ""),
  model: String(row.model ?? ""),
  color: row.color ? String(row.color) : undefined,
  storage: row.storage ? String(row.storage) : undefined,
  ram: row.ram ? String(row.ram) : undefined,
  carrier: row.carrier ? String(row.carrier) : undefined,
  accessories: row.accessories ? String(row.accessories) : undefined,
  sellerName: row.seller_name ? String(row.seller_name) : undefined,
  sellerPhone: row.seller_phone ? String(row.seller_phone) : undefined,
  purchasePrice: Number(row.purchase_price ?? 0),
  purchaseDeposit: Number(row.purchase_deposit ?? 0),
  shippingFee: Number(row.shipping_fee ?? 0),
  purchaseDate: String(row.purchase_date ?? ""),
  status: row.status as Phone["status"],
  notes: row.notes ? String(row.notes) : undefined,
  imageFront: row.image_front ? String(row.image_front) : undefined,
  imageBack: row.image_back ? String(row.image_back) : undefined,
  imageImei: row.image_imei ? String(row.image_imei) : undefined,
  imageAccessories: row.image_accessories ? String(row.image_accessories) : undefined,
  updatedAt: String(row.updated_at ?? new Date().toISOString())
});

export const faultToRow = (fault: PhoneFault) => ({
  id: fault.id,
  phone_id: fault.phoneId,
  fault_name: fault.faultName
});

const rowToFault = (row: Record<string, unknown>): PhoneFault => ({
  id: String(row.id),
  phoneId: String(row.phone_id),
  faultName: String(row.fault_name ?? "")
});

export const repairToRow = (repair: Repair) => ({
  id: repair.id,
  phone_id: repair.phoneId,
  repair_date: repair.repairDate,
  description: repair.description,
  technician: repair.technician ?? null,
  labor_cost: repair.laborCost,
  notes: repair.notes ?? null
});

const rowToRepair = (row: Record<string, unknown>): Repair => ({
  id: String(row.id),
  phoneId: String(row.phone_id),
  repairDate: String(row.repair_date ?? ""),
  description: String(row.description ?? ""),
  technician: row.technician ? String(row.technician) : undefined,
  laborCost: Number(row.labor_cost ?? 0),
  notes: row.notes ? String(row.notes) : undefined
});

export const partToRow = (part: Part) => ({
  id: part.id,
  brand: part.brand ?? null,
  name: part.name,
  category: part.category,
  compatible_models: part.compatibleModels ?? null,
  purchase_cost: part.purchaseCost,
  quantity: part.quantity,
  minimum_stock: part.minimumStock,
  supplier: part.supplier ?? null,
  notes: part.notes ?? null
});

const rowToPart = (row: Record<string, unknown>): Part => ({
  id: String(row.id),
  brand: row.brand ? String(row.brand) : undefined,
  name: String(row.name ?? ""),
  category: String(row.category ?? ""),
  compatibleModels: row.compatible_models ? String(row.compatible_models) : undefined,
  purchaseCost: Number(row.purchase_cost ?? 0),
  quantity: Number(row.quantity ?? 0),
  minimumStock: Number(row.minimum_stock ?? 0),
  supplier: row.supplier ? String(row.supplier) : undefined,
  notes: row.notes ? String(row.notes) : undefined
});

export const partImportToRow = (partImport: PartImport) => ({
  id: partImport.id,
  part_id: partImport.partId,
  quantity: partImport.quantity,
  unit_cost: partImport.unitCost,
  import_datetime: partImport.importDateTime,
  supplier: partImport.supplier ?? null,
  notes: partImport.notes ?? null
});

const rowToPartImport = (row: Record<string, unknown>): PartImport => ({
  id: String(row.id),
  partId: String(row.part_id),
  quantity: Number(row.quantity ?? 0),
  unitCost: Number(row.unit_cost ?? 0),
  importDateTime: String(row.import_datetime ?? ""),
  supplier: row.supplier ? String(row.supplier) : undefined,
  notes: row.notes ? String(row.notes) : undefined
});

export const repairPartToRow = (repairPart: RepairPart) => ({
  id: repairPart.id,
  repair_id: repairPart.repairId,
  part_id: repairPart.partId,
  quantity: repairPart.quantity,
  unit_cost: repairPart.unitCost
});

const rowToRepairPart = (row: Record<string, unknown>): RepairPart => ({
  id: String(row.id),
  repairId: String(row.repair_id),
  partId: String(row.part_id),
  quantity: Number(row.quantity ?? 0),
  unitCost: Number(row.unit_cost ?? 0)
});

export const expenseToRow = (expense: Expense) => ({
  id: expense.id,
  phone_id: expense.phoneId ?? null,
  amount: expense.amount,
  category: expense.category,
  description: expense.description,
  date: expense.date
});

const rowToExpense = (row: Record<string, unknown>): Expense => ({
  id: String(row.id),
  phoneId: row.phone_id ? String(row.phone_id) : undefined,
  amount: Number(row.amount ?? 0),
  category: String(row.category ?? ""),
  description: String(row.description ?? ""),
  date: String(row.date ?? "")
});

export const customerToRow = (customer: Customer) => ({
  id: customer.id,
  name: customer.name,
  phone: customer.phone,
  address: customer.address ?? null,
  notes: customer.notes ?? null
});

const rowToCustomer = (row: Record<string, unknown>): Customer => ({
  id: String(row.id),
  name: String(row.name ?? ""),
  phone: String(row.phone ?? ""),
  address: row.address ? String(row.address) : undefined,
  notes: row.notes ? String(row.notes) : undefined
});

export const saleToRow = (sale: Sale) => ({
  id: sale.id,
  phone_id: sale.phoneId,
  customer_id: sale.customerId,
  sale_price: sale.salePrice,
  deposit_amount: sale.depositAmount ?? 0,
  sale_date: sale.saleDate,
  sale_datetime: sale.saleDateTime ?? null,
  delivery_status: sale.deliveryStatus,
  notes: sale.notes ?? null
});

const rowToSale = (row: Record<string, unknown>): Sale => ({
  id: String(row.id),
  phoneId: String(row.phone_id),
  customerId: String(row.customer_id),
  salePrice: Number(row.sale_price ?? 0),
  depositAmount: Number(row.deposit_amount ?? 0),
  saleDate: String(row.sale_date ?? ""),
  saleDateTime: row.sale_datetime ? String(row.sale_datetime) : undefined,
  deliveryStatus: String(row.delivery_status ?? "delivered") as Sale["deliveryStatus"],
  notes: row.notes ? String(row.notes) : undefined
});

export const settingsToRow = (settings: Settings) => ({
  id: settings.id,
  business_name: settings.businessName,
  default_warranty: settings.defaultWarranty,
  currency: settings.currency,
  dark_mode: settings.darkMode
});

const rowToSettings = (row: Record<string, unknown>): Settings => ({
  id: "settings",
  businessName: String(row.business_name ?? "Quản Lý Sửa Chữa Điện Thoại"),
  defaultWarranty: Number(row.default_warranty ?? 3),
  currency: String(row.currency ?? "VND"),
  darkMode: Boolean(row.dark_mode)
});

export const logToRow = (log: AppLog) => ({
  id: log.id,
  action: log.action,
  entity_type: log.entityType,
  entity_id: log.entityId ?? null,
  message: log.message,
  created_at: log.createdAt
});

const rowToLog = (row: Record<string, unknown>): AppLog => ({
  id: String(row.id),
  action: String(row.action ?? ""),
  entityType: String(row.entity_type ?? ""),
  entityId: row.entity_id ? String(row.entity_id) : undefined,
  message: String(row.message ?? ""),
  createdAt: String(row.created_at ?? "")
});

function deletedRowLabel(table: string, row: Record<string, unknown>) {
  if (table === "phones") return `${row.brand ?? ""} ${row.model ?? ""}`.trim() || String(row.id);
  if (table === "parts") return `${row.brand ? `${row.brand} - ` : ""}${row.name ?? ""}`.trim() || String(row.id);
  if (table === "part_imports") return `Phiếu nhập ${row.quantity ?? 0} linh kiện`;
  if (table === "customers") return `${row.name ?? ""} ${row.phone ?? ""}`.trim() || String(row.id);
  if (table === "sales") return `Đơn bán ${row.sale_date ?? ""}`;
  if (table === "repairs") return `Sửa chữa ${row.repair_date ?? ""}`;
  if (table === "repair_parts") return `Linh kiện sửa chữa x${row.quantity ?? 0}`;
  if (table === "phone_faults") return String(row.fault_name ?? row.id);
  if (table === "expenses") return `${row.category ?? ""} ${row.amount ?? ""}`.trim() || String(row.id);
  return String(row.id);
}

const trashTables = ["phones", "phone_faults", "repairs", "parts", "part_imports", "repair_parts", "expenses", "customers", "sales"];

export async function fetchSupabaseData(): Promise<BackupPayload> {
  return {
    phones: (await selectActive<Record<string, unknown>>("phones")).map(rowToPhone),
    faults: (await selectActive<Record<string, unknown>>("phone_faults")).map(rowToFault),
    repairs: (await selectActive<Record<string, unknown>>("repairs")).map(rowToRepair),
    parts: (await selectActive<Record<string, unknown>>("parts")).map(rowToPart),
    partImports: (await selectActive<Record<string, unknown>>("part_imports")).map(rowToPartImport),
    repairParts: (await selectActive<Record<string, unknown>>("repair_parts")).map(rowToRepairPart),
    expenses: (await selectActive<Record<string, unknown>>("expenses")).map(rowToExpense),
    customers: (await selectActive<Record<string, unknown>>("customers")).map(rowToCustomer),
    sales: (await selectActive<Record<string, unknown>>("sales")).map(rowToSale),
    settings: (await selectAll<Record<string, unknown>>("settings")).map(rowToSettings)
  };
}

export async function fetchAppLogs() {
  return (await selectAll<Record<string, unknown>>("app_logs")).map(rowToLog).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function fetchDeletedRows(): Promise<DeletedRow[]> {
  if (!supabase) return [];
  const rows: DeletedRow[] = [];
  for (const table of trashTables) {
    const { data, error } = await supabase.from(table).select("*").not("deleted_at", "is", null);
    if (error) throw error;
    for (const row of data ?? []) {
      rows.push({
        table,
        id: String(row.id),
        label: deletedRowLabel(table, row),
        deletedAt: String(row.deleted_at),
        row
      });
    }
  }
  return rows.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function pushBackupToSupabase(payload: BackupPayload) {
  await upsertRows("phones", payload.phones.map(phoneToRow));
  await upsertRows("phone_faults", payload.faults.map(faultToRow));
  await upsertRows("parts", payload.parts.map(partToRow));
  await upsertRows("part_imports", (payload.partImports ?? []).map(partImportToRow));
  await upsertRows("repairs", payload.repairs.map(repairToRow));
  await upsertRows("repair_parts", payload.repairParts.map(repairPartToRow));
  await upsertRows("expenses", payload.expenses.map(expenseToRow));
  await upsertRows("customers", payload.customers.map(customerToRow));
  await upsertRows("sales", payload.sales.map(saleToRow));
  await upsertRows("settings", payload.settings.map(settingsToRow));
  await upsertRows("app_logs", (payload.appLogs ?? []).map(logToRow));
}

export const remoteUpsert = {
  phone: (phone: Phone) => upsertRow("phones", phoneToRow(phone)),
  fault: (fault: PhoneFault) => upsertRow("phone_faults", faultToRow(fault)),
  part: (part: Part) => upsertRow("parts", partToRow(part)),
  partImport: (partImport: PartImport) => upsertRow("part_imports", partImportToRow(partImport)),
  repair: (repair: Repair) => upsertRow("repairs", repairToRow(repair)),
  repairPart: (repairPart: RepairPart) => upsertRow("repair_parts", repairPartToRow(repairPart)),
  customer: (customer: Customer) => upsertRow("customers", customerToRow(customer)),
  sale: (sale: Sale) => upsertRow("sales", saleToRow(sale)),
  settings: (settings: Settings) => upsertRow("settings", settingsToRow(settings)),
  log: (log: AppLog) => upsertRow("app_logs", logToRow(log))
};
