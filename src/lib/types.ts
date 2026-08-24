export type PhoneStatus =
  | "Purchased"
  | "Waiting Inspection"
  | "Waiting Repair"
  | "Repairing"
  | "Ready For Sale"
  | "Reserved"
  | "Sold";

export type Phone = {
  id: string;
  imei1: string;
  imei2?: string;
  brand: string;
  model: string;
  color?: string;
  storage?: string;
  ram?: string;
  carrier?: string;
  accessories?: string;
  sellerName?: string;
  sellerPhone?: string;
  purchasePrice: number;
  purchaseDeposit?: number;
  shippingFee?: number;
  askingPrice?: number;
  purchaseDate: string;
  status: PhoneStatus;
  notes?: string;
  imageFront?: string;
  imageBack?: string;
  imageImei?: string;
  imageAccessories?: string;
  updatedAt: string;
};

export type PhoneFault = {
  id: string;
  phoneId: string;
  faultName: string;
};

export type Repair = {
  id: string;
  phoneId: string;
  repairDate: string;
  description: string;
  technician?: string;
  laborCost: number;
  notes?: string;
};

export type Part = {
  id: string;
  brand?: string;
  name: string;
  category: string;
  compatibleModels?: string;
  purchaseCost: number;
  quantity: number;
  minimumStock: number;
  supplier?: string;
  notes?: string;
};

export type PartImportStatus = "importing" | "imported";

export type PartImport = {
  id: string;
  partId: string;
  quantity: number;
  unitCost: number;
  importDateTime: string;
  supplier?: string;
  notes?: string;
  status: PartImportStatus;
};

export type RepairPart = {
  id: string;
  repairId: string;
  partId: string;
  quantity: number;
  unitCost: number;
};

export type Expense = {
  id: string;
  phoneId?: string;
  amount: number;
  category: string;
  description: string;
  date: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
};

export type SaleDeliveryStatus = "pending_delivery" | "delivered" | "not_received";

export type Sale = {
  id: string;
  phoneId: string;
  customerId: string;
  salePrice: number;
  depositAmount: number;
  saleDate: string;
  saleDateTime?: string;
  deliveryStatus: SaleDeliveryStatus;
  notes?: string;
};

export type Settings = {
  id: "settings";
  businessName: string;
  defaultWarranty: number;
  currency: string;
  darkMode: boolean;
};

export type AppLog = {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  message: string;
  createdAt: string;
};

export type DeletedRow = {
  table: string;
  id: string;
  label: string;
  deletedAt: string;
  row: Record<string, unknown>;
};

export type BackupPayload = {
  phones: Phone[];
  faults: PhoneFault[];
  repairs: Repair[];
  parts: Part[];
  partImports: PartImport[];
  repairParts: RepairPart[];
  expenses: Expense[];
  customers: Customer[];
  sales: Sale[];
  settings: Settings[];
  appLogs?: AppLog[];
};
