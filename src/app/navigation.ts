import {
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  Download,
  PackagePlus,
  Settings as SettingsIcon,
  Smartphone,
  Users
} from "lucide-react";

export type View = "dashboard" | "phones" | "parts" | "partImports" | "sales" | "reports" | "customers" | "settings";

export const navItems: { id: View; label: string; icon: typeof Smartphone }[] = [
  { id: "dashboard", label: "Tổng quan", icon: ChartNoAxesCombined },
  { id: "phones", label: "Điện thoại", icon: Smartphone },
  { id: "parts", label: "Linh kiện", icon: Boxes },
  { id: "partImports", label: "Lịch sử nhập", icon: PackagePlus },
  { id: "sales", label: "Bán hàng", icon: CircleDollarSign },
  { id: "customers", label: "Khách hàng", icon: Users },
  { id: "reports", label: "Báo cáo", icon: Download },
  { id: "settings", label: "Cài đặt", icon: SettingsIcon }
];
