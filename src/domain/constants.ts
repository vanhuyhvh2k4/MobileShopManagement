import type { PhoneStatus, SaleDeliveryStatus, Settings } from "../lib/types";

export const statuses: PhoneStatus[] = [
  "Purchased",
  "Waiting Inspection",
  "Waiting Repair",
  "Repairing",
  "Ready For Sale",
  "Reserved",
  "Sold"
];

export const statusLabels: Record<PhoneStatus, string> = {
  Purchased: "Đã cọc/chờ nhận",
  "Waiting Inspection": "Chờ kiểm tra",
  "Waiting Repair": "Chờ sửa",
  Repairing: "Đang sửa",
  "Ready For Sale": "Sẵn sàng bán",
  Reserved: "Đã giữ hàng",
  Sold: "Đã bán"
};

export const editablePhoneStatuses: PhoneStatus[] = [
  "Purchased",
  "Waiting Inspection",
  "Waiting Repair",
  "Repairing",
  "Ready For Sale"
];

export const preRepairStatuses: PhoneStatus[] = ["Purchased", "Waiting Inspection"];
export const stockReservedRepairStatuses: PhoneStatus[] = ["Waiting Repair", "Repairing"];

export const deliveryStatuses: SaleDeliveryStatus[] = ["pending_delivery", "delivered", "not_received"];

export const deliveryStatusLabels: Record<SaleDeliveryStatus, string> = {
  pending_delivery: "Chờ vận chuyển",
  delivered: "Đã giao",
  not_received: "Không nhận hàng"
};

export const logActionLabels: Record<string, string> = {
  create: "Tạo mới",
  update: "Cập nhật",
  save: "Lưu",
  delete: "Xoá",
  restore: "Khôi phục"
};

export const entityTypeLabels: Record<string, string> = {
  phones: "Điện thoại",
  phone_faults: "Lỗi điện thoại",
  parts: "Linh kiện",
  part_imports: "Nhập linh kiện",
  repairs: "Sửa chữa",
  repair_parts: "Linh kiện thay",
  expenses: "Chi phí",
  customers: "Khách hàng",
  sales: "Bán hàng",
  settings: "Cài đặt"
};

export const defaultSettings: Settings = {
  id: "settings",
  businessName: "Quản Lý Sửa Chữa Điện Thoại",
  defaultWarranty: 3,
  currency: "VND",
  darkMode: false
};

export const authSessionDeadlineKey = "phone-manager-auth-deadline";
export const loginDurationMs = 2 * 24 * 60 * 60 * 1000;
