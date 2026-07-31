export type PhoneStatus =
  | "Purchased"
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
  shippingFee?: number;
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
  notes?: string;
};

export type Sale = {
  id: string;
  phoneId: string;
  customerId: string;
  salePrice: number;
  saleDate: string;
  warrantyMonths: number;
  notes?: string;
};

export type Settings = {
  id: "settings";
  businessName: string;
  defaultWarranty: number;
  currency: string;
  darkMode: boolean;
};

export type BackupPayload = {
  phones: Phone[];
  faults: PhoneFault[];
  repairs: Repair[];
  parts: Part[];
  repairParts: RepairPart[];
  expenses: Expense[];
  customers: Customer[];
  sales: Sale[];
  settings: Settings[];
};
