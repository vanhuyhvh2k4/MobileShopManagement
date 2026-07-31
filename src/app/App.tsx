import {
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  Download,
  LockKeyhole,
  LogOut,
  Moon,
  PackagePlus,
  PanelLeft,
  Plus,
  Search,
  Settings as SettingsIcon,
  Smartphone,
  Sun,
  Upload,
  Users,
  Wrench,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { ReactNode } from "react";
import { buildMetrics, monthlySeries, phoneCost, saleProfit } from "../lib/calculations";
import { supabase } from "../lib/supabase";
import {
  deleteRemoteRow,
  deleteRemoteWhere,
  fetchSupabaseData,
  pushBackupToSupabase,
  remoteUpsert
} from "../lib/supabaseSync";
import type {
  BackupPayload,
  Customer,
  Expense,
  Part,
  Phone,
  PhoneFault,
  PhoneStatus,
  Repair,
  RepairPart,
  Sale,
  Settings
} from "../lib/types";
import { cn, currency, todayISO, uid } from "../lib/utils";

const statuses: PhoneStatus[] = [
  "Purchased",
  "Waiting Repair",
  "Repairing",
  "Ready For Sale",
  "Reserved",
  "Sold"
];

const statusLabels: Record<PhoneStatus, string> = {
  Purchased: "Đã mua",
  "Waiting Repair": "Chờ sửa",
  Repairing: "Đang sửa",
  "Ready For Sale": "Sẵn sàng bán",
  Reserved: "Đã giữ hàng",
  Sold: "Đã bán"
};

type View = "dashboard" | "phones" | "parts" | "sales" | "reports" | "customers" | "settings";

const navItems: { id: View; label: string; icon: typeof Smartphone }[] = [
  { id: "dashboard", label: "Tổng quan", icon: ChartNoAxesCombined },
  { id: "phones", label: "Điện thoại", icon: Smartphone },
  { id: "parts", label: "Linh kiện", icon: Boxes },
  { id: "sales", label: "Bán hàng", icon: CircleDollarSign },
  { id: "customers", label: "Khách hàng", icon: Users },
  { id: "reports", label: "Báo cáo", icon: Download },
  { id: "settings", label: "Cài đặt", icon: SettingsIcon }
];

const defaultSettings: Settings = {
  id: "settings",
  businessName: "Quản Lý Sửa Chữa Điện Thoại",
  defaultWarranty: 3,
  currency: "VND",
  darkMode: false
};

const authSessionDeadlineKey = "phone-manager-auth-deadline";
const loginDurationMs = 2 * 24 * 60 * 60 * 1000;

const blankPhone = (): Phone => ({
  id: uid("phone"),
  imei1: "",
  brand: "",
  model: "",
  purchasePrice: 0,
  shippingFee: 0,
  purchaseDate: todayISO(),
  status: "Purchased",
  updatedAt: new Date().toISOString()
});

const blankPart = (): Part => ({
  id: uid("part"),
  brand: "",
  name: "",
  category: "",
  purchaseCost: 0,
  quantity: 0,
  minimumStock: 1
});

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function uniqueValues(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b)
  );
}

function isPartRecommendedForPhone(part: Part, phone: Phone) {
  const haystack = [part.brand, part.compatibleModels, part.name, part.category].filter(Boolean).join(" ").toLowerCase();
  return [phone.brand, phone.model].filter(Boolean).some((value) => haystack.includes(value.toLowerCase()));
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    page: safePage,
    totalPages,
    items: items.slice((safePage - 1) * pageSize, safePage * pageSize)
  };
}

function hasValidAuthDeadline() {
  try {
    const raw = window.localStorage.getItem(authSessionDeadlineKey);
    if (!raw) return false;
    const expiresAt = Number(raw);
    if (!expiresAt || expiresAt <= Date.now()) {
      window.localStorage.removeItem(authSessionDeadlineKey);
      return false;
    }
    return true;
  } catch {
    window.localStorage.removeItem(authSessionDeadlineKey);
    return false;
  }
}

export function App() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [query, setQuery] = useState("");
  const [phoneDraft, setPhoneDraft] = useState<Phone | null>(null);
  const [partDraft, setPartDraft] = useState<Part | null>(null);
  const [repairPhone, setRepairPhone] = useState<Phone | null>(null);
  const [syncMessage, setSyncMessage] = useState(supabase ? "Đang kết nối Supabase..." : "Chưa cấu hình Supabase");
  const searchRef = useRef<HTMLInputElement>(null);

  const [phones, setPhones] = useState<Phone[]>([]);
  const [faults, setFaults] = useState<PhoneFault[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [repairParts, setRepairParts] = useState<RepairPart[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);

  function reportSyncError(error: unknown) {
    const message = error instanceof Error ? error.message : "Không rõ lỗi";
    setSyncMessage(`Lỗi Supabase: ${message}`);
    console.error(error);
  }

  function clearPrivateState() {
    setPhones([]);
    setFaults([]);
    setRepairs([]);
    setParts([]);
    setRepairParts([]);
    setExpenses([]);
    setCustomers([]);
    setSales([]);
    setSettings(defaultSettings);
    setQuery("");
    setPhoneDraft(null);
    setPartDraft(null);
    setRepairPhone(null);
  }

  useEffect(() => {
    let active = true;
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    void (async () => {
      const { data } = await supabase.auth.getSession();
      const authenticated = Boolean(data.session) && hasValidAuthDeadline();
      if (!authenticated && data.session) {
        await supabase.auth.signOut();
      }
      if (!active) return;
      setIsAuthenticated(authenticated);
      setAuthReady(true);
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.localStorage.removeItem(authSessionDeadlineKey);
        clearPrivateState();
        setIsAuthenticated(false);
        setAuthReady(true);
        return;
      }
      if (hasValidAuthDeadline()) {
        setIsAuthenticated(true);
        setAuthReady(true);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void (async () => {
      try {
        if (!supabase) {
          setSyncMessage("Chưa cấu hình Supabase. App yêu cầu Supabase để đọc/ghi dữ liệu.");
          return;
        }
        const payload = await fetchSupabaseData();
        setPhones(payload.phones);
        setFaults(payload.faults);
        setRepairs(payload.repairs);
        setParts(payload.parts);
        setRepairParts(payload.repairParts);
        setExpenses(payload.expenses);
        setCustomers(payload.customers);
        setSales(payload.sales);
        setSettings({ ...(payload.settings[0] ?? defaultSettings), currency: "VND" });
        setSyncMessage("Đã đọc dữ liệu từ Supabase");
      } catch (error) {
        reportSyncError(error);
      }
    })();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const expiresAt = Number(window.localStorage.getItem(authSessionDeadlineKey));
    if (!expiresAt) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.removeItem(authSessionDeadlineKey);
      void supabase?.auth.signOut();
      setIsAuthenticated(false);
      clearPrivateState();
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [isAuthenticated]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.darkMode);
  }, [settings.darkMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setView("phones");
        setPhoneDraft(blankPhone());
      }
      if (event.ctrlKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const filteredPhones = useMemo(() => {
    const term = query.toLowerCase();
    return phones.filter((phone) =>
      [phone.imei1, phone.imei2, phone.brand, phone.model, phone.status, statusLabels[phone.status]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [phones, query]);

  const metrics = buildMetrics({ phones, repairs, repairParts, expenses, sales, parts });
  const chartData = monthlySeries(sales, phones, repairs, repairParts, expenses);

  async function savePhone(phone: Phone, faultNames: string[]) {
    const savedPhone = { ...phone, updatedAt: new Date().toISOString() };
    const faultsToSave = faultNames
      .map((faultName) => faultName.trim())
      .filter(Boolean)
      .map((faultName) => ({ id: uid("fault"), phoneId: phone.id, faultName }));
    try {
      await remoteUpsert.phone(savedPhone);
      await deleteRemoteWhere("phone_faults", "phone_id", phone.id);
      await Promise.all(faultsToSave.map((fault) => remoteUpsert.fault(fault)));
      setPhones((current) => [...current.filter((item) => item.id !== savedPhone.id), savedPhone]);
      setFaults((current) => [...current.filter((fault) => fault.phoneId !== phone.id), ...faultsToSave]);
      setSyncMessage("Đã ghi điện thoại lên Supabase");
      setPhoneDraft(null);
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function savePart(part: Part) {
    try {
      await remoteUpsert.part(part);
      setParts((current) => [...current.filter((item) => item.id !== part.id), part]);
      setSyncMessage("Đã ghi linh kiện lên Supabase");
      setPartDraft(null);
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function deletePhone(phone: Phone) {
    if (!window.confirm(`Xoá ${phone.brand} ${phone.model}? Dữ liệu lỗi, sửa chữa, chi phí và bán hàng liên quan cũng sẽ bị xoá.`)) return;
    const phoneRepairs = repairs.filter((repair) => repair.phoneId === phone.id);
    const repairIds = phoneRepairs.map((repair) => repair.id);
    try {
      await deleteRemoteWhere("sales", "phone_id", phone.id);
      await deleteRemoteWhere("expenses", "phone_id", phone.id);
      await deleteRemoteWhere("phone_faults", "phone_id", phone.id);
      await Promise.all(repairIds.map((repairId) => deleteRemoteWhere("repair_parts", "repair_id", repairId)));
      await deleteRemoteWhere("repairs", "phone_id", phone.id);
      await deleteRemoteRow("phones", phone.id);
      setPhones((current) => current.filter((item) => item.id !== phone.id));
      setFaults((current) => current.filter((fault) => fault.phoneId !== phone.id));
      setRepairs((current) => current.filter((repair) => repair.phoneId !== phone.id));
      setRepairParts((current) => current.filter((repairPart) => !repairIds.includes(repairPart.repairId)));
      setExpenses((current) => current.filter((expense) => expense.phoneId !== phone.id));
      setSales((current) => current.filter((sale) => sale.phoneId !== phone.id));
      setSyncMessage("Đã xoá điện thoại trên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function deletePart(part: Part) {
    if (!window.confirm(`Xoá linh kiện "${part.name}" khỏi kho? Lịch sử sửa chữa cũ vẫn giữ đơn giá đã dùng.`)) return;
    try {
      await deleteRemoteRow("parts", part.id);
      setParts((current) => current.filter((item) => item.id !== part.id));
      setSyncMessage("Đã xoá linh kiện trên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function deleteSale(sale: Sale) {
    if (!window.confirm("Xoá giao dịch bán hàng này? Máy sẽ được chuyển lại về trạng thái sẵn sàng bán.")) return;
    try {
      const phone = phones.find((item) => item.id === sale.phoneId);
      const restoredPhone = phone ? { ...phone, status: "Ready For Sale" as const, updatedAt: new Date().toISOString() } : undefined;
      await deleteRemoteRow("sales", sale.id);
      if (restoredPhone) await remoteUpsert.phone(restoredPhone);
      setSales((current) => current.filter((item) => item.id !== sale.id));
      if (restoredPhone) setPhones((current) => current.map((item) => (item.id === restoredPhone.id ? restoredPhone : item)));
      setSyncMessage("Đã xoá giao dịch trên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function deleteCustomer(customerId: string) {
    if (!window.confirm("Xoá khách hàng này? Các giao dịch bán hàng vẫn được giữ lại nhưng sẽ hiển thị khách hàng là không rõ.")) return;
    try {
      await deleteRemoteRow("customers", customerId);
      setCustomers((current) => current.filter((customer) => customer.id !== customerId));
      setSyncMessage("Đã xoá khách hàng trên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function updateSettings(nextSettings: Settings) {
    const savedSettings = { ...nextSettings, currency: "VND" };
    setSettings(savedSettings);
    try {
      await remoteUpsert.settings(savedSettings);
      setSyncMessage("Đã ghi cài đặt lên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function saveSale(input: {
    phoneId: string;
    customerName: string;
    customerPhone: string;
    salePrice: number;
    saleDate: string;
    warrantyMonths: number;
    notes: string;
  }) {
    if (!input.phoneId) return;
    const customer: Customer = {
      id: uid("customer"),
      name: input.customerName,
      phone: input.customerPhone
    };
    const sale: Sale = {
      id: uid("sale"),
      phoneId: input.phoneId,
      customerId: customer.id,
      salePrice: Number(input.salePrice),
      saleDate: input.saleDate,
      warrantyMonths: Number(input.warrantyMonths),
      notes: input.notes
    };
    const phone = phones.find((item) => item.id === input.phoneId);
    const soldPhone = phone ? { ...phone, status: "Sold" as const, updatedAt: new Date().toISOString() } : undefined;
    try {
      await remoteUpsert.customer(customer);
      await remoteUpsert.sale(sale);
      if (soldPhone) await remoteUpsert.phone(soldPhone);
      setCustomers((current) => [...current, customer]);
      setSales((current) => [...current, sale]);
      if (soldPhone) setPhones((current) => current.map((item) => (item.id === soldPhone.id ? soldPhone : item)));
      setSyncMessage("Đã ghi bán hàng lên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function saveRepair(input: {
    phone: Phone;
    description: string;
    technician: string;
    laborCost: number;
    notes: string;
    selectedParts: { part: Part; quantity: number }[];
  }) {
    const updatedParts = input.selectedParts.map(({ part, quantity }) => ({
      ...part,
      quantity: Math.max(0, part.quantity - quantity)
    }));
    const savedPhone = {
      ...input.phone,
      status: "Ready For Sale" as const,
      updatedAt: new Date().toISOString()
    };
    const repairId = uid("repair");
    const savedRepair: Repair = {
      id: repairId,
      phoneId: input.phone.id,
      repairDate: todayISO(),
      description: input.description,
      technician: input.technician,
      laborCost: input.laborCost,
      notes: input.notes
    };
    const replacements: RepairPart[] = input.selectedParts.map(({ part, quantity }) => ({
      id: uid("repairpart"),
      repairId,
      partId: part.id,
      quantity,
      unitCost: part.purchaseCost
    }));
    try {
      await remoteUpsert.repair(savedRepair);
      await Promise.all(replacements.map((replacement) => remoteUpsert.repairPart(replacement)));
      await Promise.all(updatedParts.map((part) => remoteUpsert.part(part)));
      await remoteUpsert.phone(savedPhone);
      setRepairs((current) => [...current, savedRepair]);
      setRepairParts((current) => [...current, ...replacements]);
      setParts((current) => current.map((part) => updatedParts.find((updated) => updated.id === part.id) ?? part));
      setPhones((current) => current.map((phone) => (phone.id === savedPhone.id ? savedPhone : phone)));
      setSyncMessage("Đã ghi sửa chữa lên Supabase");
      setRepairPhone(null);
    } catch (error) {
      reportSyncError(error);
    }
  }

  function makeBackupPayload(): BackupPayload {
    return {
      phones,
      faults,
      repairs,
      parts,
      repairParts,
      expenses,
      customers,
      sales,
      settings: [settings]
    };
  }

  async function handleBackup() {
    const payload = makeBackupPayload();
    const file = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sao-luu-quan-ly-dien-thoai-${todayISO()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleRestore(file?: File) {
    if (!file) return;
    const payload = JSON.parse(await file.text()) as BackupPayload;
    try {
      await pushBackupToSupabase(payload);
      setPhones(payload.phones ?? []);
      setFaults(payload.faults ?? []);
      setRepairs(payload.repairs ?? []);
      setParts(payload.parts ?? []);
      setRepairParts(payload.repairParts ?? []);
      setExpenses(payload.expenses ?? []);
      setCustomers(payload.customers ?? []);
      setSales(payload.sales ?? []);
      setSettings(payload.settings?.[0] ?? defaultSettings);
      setSyncMessage("Đã khôi phục và ghi dữ liệu lên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function handlePushLocalToSupabase() {
    try {
      await pushBackupToSupabase(makeBackupPayload());
      setSyncMessage("Đã đẩy dữ liệu hiện tại lên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function handleLogin(input: { email: string; password: string }) {
    if (!supabase) {
      setLoginError("Chưa cấu hình Supabase. Cần VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: input.email.trim(),
      password: input.password
    });
    if (error) {
      setLoginError("Email hoặc mật khẩu không đúng.");
      return;
    }
    window.localStorage.setItem(authSessionDeadlineKey, String(Date.now() + loginDurationMs));
    setLoginError("");
    setIsAuthenticated(true);
    setAuthReady(true);
  }

  async function handleLogout() {
    window.localStorage.removeItem(authSessionDeadlineKey);
    await supabase?.auth.signOut();
    setIsAuthenticated(false);
    clearPrivateState();
  }

  if (!authReady) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <LoginScreen businessName={settings.businessName} error={loginError} onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-card px-4 py-5 lg:block">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
            <Smartphone size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold">{settings.businessName}</h1>
            <p className="text-xs text-slate-500">Quầy sửa chữa ngoại tuyến</p>
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={cn(
                "flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium",
                view === item.id ? "bg-muted text-primary" : "hover:bg-muted"
              )}
              onClick={() => setView(item.id)}
            >
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-secondary lg:hidden" aria-label="Mở menu">
              <PanelLeft size={18} />
            </button>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                ref={searchRef}
                className="field pl-10"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Tìm IMEI, model, hãng, khách hàng, trạng thái"
              />
            </div>
            <button className="btn-primary" onClick={() => setPhoneDraft(blankPhone())}>
              <Plus size={18} />
              <span className="hidden sm:inline">Thêm máy</span>
            </button>
            <button
              className="btn-secondary"
              aria-label="Bật/tắt chế độ tối"
              onClick={() => void updateSettings({ ...settings, darkMode: !settings.darkMode })}
            >
              {settings.darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="btn-secondary" aria-label="Đăng xuất" onClick={() => void handleLogout()}>
              <LogOut size={18} />
            </button>
          </div>
          <div className="mt-2 text-xs text-slate-500">{syncMessage}</div>
          <div className="mt-3 flex gap-2 overflow-auto lg:hidden">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={cn("btn-secondary h-9 whitespace-nowrap", view === item.id && "border-primary text-primary")}
                onClick={() => setView(item.id)}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <section className="p-4 md:p-6">
          {view === "dashboard" && (
            <Dashboard metrics={metrics} chartData={chartData} settings={settings} parts={parts} />
          )}
          {view === "phones" && (
            <PhonesView
              phones={filteredPhones}
              faults={faults}
              repairs={repairs}
              repairParts={repairParts}
              expenses={expenses}
              settings={settings}
              onEdit={setPhoneDraft}
              onRepair={setRepairPhone}
              onDelete={deletePhone}
            />
          )}
          {view === "parts" && <PartsView parts={parts} onEdit={setPartDraft} onDelete={deletePart} />}
          {view === "sales" && (
            <SalesView
              phones={phones}
              customers={customers}
              sales={sales}
              settings={settings}
              repairs={repairs}
              repairParts={repairParts}
              expenses={expenses}
              onDelete={deleteSale}
              onSave={saveSale}
            />
          )}
          {view === "customers" && <CustomersView customers={customers} sales={sales} phones={phones} onDelete={deleteCustomer} />}
          {view === "reports" && (
            <ReportsView
              phones={phones}
              repairs={repairs}
              repairParts={repairParts}
              expenses={expenses}
              sales={sales}
              settings={settings}
              onBackup={handleBackup}
              onRestore={handleRestore}
              onPushLocal={handlePushLocalToSupabase}
            />
          )}
          {view === "settings" && (
            <SettingsView settings={settings} supabaseConfigured={Boolean(supabase)} onChange={updateSettings} />
          )}
        </section>
      </main>

      {phoneDraft && (
        <PhoneDialog
          phone={phoneDraft}
          phones={phones}
          faults={faults.filter((fault) => fault.phoneId === phoneDraft.id)}
          onClose={() => setPhoneDraft(null)}
          onSave={savePhone}
        />
      )}
      {partDraft && (
        <PartDialog part={partDraft} parts={parts} onClose={() => setPartDraft(null)} onSave={savePart} />
      )}
      {repairPhone && (
        <RepairDialog
          phone={repairPhone}
          parts={parts}
          repairs={repairs}
          repairParts={repairParts}
          expenses={expenses}
          settings={settings}
          onClose={() => setRepairPhone(null)}
          onSave={saveRepair}
        />
      )}
    </div>
  );
}

function LoginScreen({
  businessName,
  error,
  onLogin
}: {
  businessName: string;
  error: string;
  onLogin: (input: { email: string; password: string }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form
        className="card w-full max-w-sm space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            setSubmitting(true);
            await onLogin({ email, password });
            setSubmitting(false);
          })();
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-white">
            <LockKeyhole size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{businessName}</h1>
            <p className="text-sm text-slate-500">Đăng nhập để quản lý cửa hàng</p>
          </div>
        </div>
        <Labeled label="Email">
          <input
            className="field"
            type="email"
            value={email}
            autoComplete="username"
            placeholder="email-da-tao-trong-supabase@example.com"
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Labeled>
        <Labeled label="Mật khẩu">
          <input
            className="field"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Labeled>
        {error && <div className="rounded-md bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">{error}</div>}
        <button className="btn-primary w-full" disabled={submitting}>
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
        <p className="text-center text-xs text-slate-500">Phiên Supabase Auth trên thiết bị này được giới hạn 2 ngày.</p>
      </form>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="card flex w-full max-w-sm items-center gap-3 p-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-primary">
          <LockKeyhole size={20} />
        </div>
        <div>
          <p className="font-semibold">Đang kiểm tra đăng nhập</p>
          <p className="text-sm text-slate-500">Vui lòng chờ trong giây lát.</p>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  metrics,
  chartData,
  settings,
  parts
}: {
  metrics: ReturnType<typeof buildMetrics>;
  chartData: ReturnType<typeof monthlySeries>;
  settings: Settings;
  parts: Part[];
}) {
  const lowStockParts = parts.filter((part) => part.quantity <= part.minimumStock);
  const topCards = [
    {
      label: "Vốn đang nằm trong hàng",
      value: currency(metrics.inventoryValue, settings.currency),
      hint: `${metrics.inStock} máy chưa bán`,
      icon: Boxes
    },
    {
      label: "Lợi nhuận tháng này",
      value: currency(metrics.profitMonth, settings.currency),
      hint: `Doanh thu ${currency(metrics.revenueMonth, settings.currency)}`,
      icon: CircleDollarSign,
      warn: metrics.profitMonth < 0
    },
    {
      label: "Máy sẵn sàng bán",
      value: metrics.ready.toString(),
      hint: "Có thể chốt giá bán ra",
      icon: Smartphone
    },
    {
      label: "Cần xử lý",
      value: (metrics.waitingRepair + metrics.lowStock).toString(),
      hint: `${metrics.waitingRepair} máy chờ sửa, ${metrics.lowStock} linh kiện sắp hết`,
      icon: Wrench,
      warn: metrics.waitingRepair + metrics.lowStock > 0
    }
  ];
  const operationCards = [
    ["Máy chờ sửa", metrics.waitingRepair.toString(), "Cần kiểm tra và thay linh kiện"],
    ["Đã bán hôm nay", metrics.soldToday.toString(), currency(metrics.revenueToday, settings.currency)],
    ["Lợi nhuận hôm nay", currency(metrics.profitToday, settings.currency), "Sau khi trừ tổng vốn"]
  ];
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tổng quan kinh doanh</h2>
        <p className="text-sm text-slate-500">Theo dõi vốn, bán hàng và các việc cần xử lý trong ngày.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {topCards.map(({ label, value, hint, icon: Icon, warn }) => (
          <div className={cn("card p-4", warn && "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20")} key={label}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="label">{label}</p>
                <p className={cn("mt-2 text-xl font-bold md:text-2xl", warn && "text-amber-700 dark:text-amber-200")}>{value}</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{hint}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-primary">
                <Icon size={20} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {operationCards.map(([label, value, hint]) => (
          <div className="card p-4" key={label}>
            <p className="label">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
            <p className="mt-1 text-sm text-slate-500">{hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="card p-4 xl:col-span-3">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Doanh thu & lợi nhuận</h2>
            <p className="text-sm text-slate-500">Theo tháng, dùng để nhìn xu hướng bán ra.</p>
          </div>
          <div className="h-56 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Area dataKey="revenue" name="Doanh thu" stroke="#14b8a6" fill="#14b8a633" />
                <Area dataKey="profit" name="Lợi nhuận" stroke="#eab308" fill="#eab30833" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card p-4 xl:col-span-2">
          <div className="mb-3">
            <h2 className="text-base font-semibold">Bán ra & mua vào</h2>
            <p className="text-sm text-slate-500">So sánh số máy nhập và bán mỗi tháng.</p>
          </div>
          <div className="h-56 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="sales" name="Bán ra" fill="#14b8a6" />
                <Bar dataKey="purchases" name="Mua vào" fill="#64748b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Cảnh báo tồn linh kiện</h2>
            <p className="text-sm text-slate-500">{lowStockParts.length} linh kiện cần nhập thêm hoặc kiểm tra lại tồn.</p>
          </div>
          <span className="rounded-md bg-muted px-3 py-2 text-sm font-semibold">{lowStockParts.length}/{parts.length}</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {lowStockParts.slice(0, 9).map((part) => (
            <div className="rounded-lg border bg-background p-3" key={part.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-500">{part.brand || "Không rõ hãng"}</p>
                  <h3 className="truncate font-semibold">{part.name}</h3>
                  <p className="truncate text-sm text-slate-500">{part.category}</p>
                </div>
                <div className="shrink-0 rounded-md bg-red-100 px-2 py-1 text-sm font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-200">
                  {part.quantity}/{part.minimumStock}
                </div>
              </div>
            </div>
          ))}
          {lowStockParts.length === 0 && <div className="py-6 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">Kho linh kiện đang ổn.</div>}
        </div>
      </div>
    </div>
  );
}

function PhonesView(props: {
  phones: Phone[];
  faults: { phoneId: string; faultName: string }[];
  repairs: Repair[];
  repairParts: RepairPart[];
  expenses: Expense[];
  settings: Settings;
  onEdit: (phone: Phone) => void;
  onRepair: (phone: Phone) => void;
  onDelete: (phone: Phone) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [repairFilter, setRepairFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const brands = uniqueValues(props.phones.map((phone) => phone.brand));
  const models = uniqueValues(
    props.phones
      .filter((phone) => brandFilter === "all" || phone.brand === brandFilter)
      .map((phone) => phone.model)
  );
  const filteredPhones = props.phones.filter((phone) => {
    const phoneFaults = props.faults.filter((fault) => fault.phoneId === phone.id);
    const repairCount = props.repairs.filter((repair) => repair.phoneId === phone.id).length;
    const text = [
      phone.imei1,
      phone.imei2,
      phone.brand,
      phone.model,
      phone.sellerName,
      phone.sellerPhone,
      phone.notes,
      phone.color,
      phone.storage,
      phone.status,
      statusLabels[phone.status],
      ...phoneFaults.map((fault) => fault.faultName)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = text.includes(searchTerm.toLowerCase());
    const matchesBrand = brandFilter === "all" || phone.brand === brandFilter;
    const matchesModel = modelFilter === "all" || phone.model === modelFilter;
    const matchesStatus = statusFilter === "all" || phone.status === statusFilter;
    const matchesRepair =
      repairFilter === "all" ||
      (repairFilter === "has_fault" && phoneFaults.length > 0) ||
      (repairFilter === "no_fault" && phoneFaults.length === 0) ||
      (repairFilter === "has_repair" && repairCount > 0) ||
      (repairFilter === "no_repair" && repairCount === 0);
    return matchesSearch && matchesBrand && matchesModel && matchesStatus && matchesRepair;
  });
  const paginatedPhones = paginate(filteredPhones, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, brandFilter, modelFilter, statusFilter, repairFilter, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Quản lý điện thoại</h2>
          <p className="text-sm text-slate-500">{filteredPhones.length}/{props.phones.length} bản ghi</p>
        </div>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 xl:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <input
            className="field"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Tìm người mua, IMEI, hãng, model, lỗi, ghi chú"
          />
          <select className="field" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="all">Tất cả hãng</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <select className="field" value={modelFilter} onChange={(event) => setModelFilter(event.target.value)}>
            <option value="all">Tất cả model</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          <select className="field" value={repairFilter} onChange={(event) => setRepairFilter(event.target.value)}>
            <option value="all">Tất cả tình trạng</option>
            <option value="has_fault">Có lỗi</option>
            <option value="no_fault">Không ghi lỗi</option>
            <option value="has_repair">Đã thay/sửa</option>
            <option value="no_repair">Chưa thay/sửa</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="space-y-3 p-3 md:hidden">
          {paginatedPhones.items.map((phone) => {
            const repairIds = new Set(props.repairs.filter((repair) => repair.phoneId === phone.id).map((repair) => repair.id));
            const partCost = props.repairParts
              .filter((part) => repairIds.has(part.repairId))
              .reduce((sum, part) => sum + part.quantity * part.unitCost, 0);
            const laborCost = props.repairs
              .filter((repair) => repair.phoneId === phone.id)
              .reduce((sum, repair) => sum + repair.laborCost, 0);
            const extraCost = props.expenses
              .filter((expense) => expense.phoneId === phone.id)
              .reduce((sum, expense) => sum + expense.amount, 0);
            const replacementCost = partCost + laborCost + extraCost;
            const totalCost = phoneCost(phone, props.repairs, props.repairParts, props.expenses);
            const faults =
              props.faults
                .filter((fault) => fault.phoneId === phone.id)
                .map((fault) => fault.faultName)
                .join(", ") || "Không có";
            return (
              <div className="rounded-lg border bg-background p-3" key={phone.id}>
                <div className="flex gap-3">
                  {phone.imageFront ? (
                    <img className="h-16 w-16 shrink-0 rounded-md object-cover" src={phone.imageFront} alt={`${phone.brand} ${phone.model}`} />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-slate-400">
                      <Smartphone size={22} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">
                          {phone.brand} {phone.model}
                        </h3>
                        <p className="truncate text-xs text-slate-500">
                          {phone.sellerName ? `Người mua: ${phone.sellerName}` : "Chưa có tên người mua"}
                        </p>
                      </div>
                      <StatusPill status={phone.status} />
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">Lỗi: {faults}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <Stat label="Giá nhập" value={currency(phone.purchasePrice, props.settings.currency)} />
                  <Stat label="Vận chuyển" value={currency(phone.shippingFee ?? 0, props.settings.currency)} />
                  <Stat label="Chi phí thay" value={currency(replacementCost, props.settings.currency)} />
                  <Stat label="Tổng vốn" value={currency(totalCost, props.settings.currency)} />
                </div>
                <div className="mt-3 grid gap-2">
                  <button className="btn-secondary w-full" onClick={() => props.onRepair(phone)}>
                    <Wrench size={16} />
                    Thay linh kiện
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn-secondary w-full" onClick={() => props.onEdit(phone)}>
                      Sửa
                    </button>
                    <button className="btn-secondary w-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => props.onDelete(phone)}>
                      Xoá
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {paginatedPhones.items.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Không có điện thoại phù hợp bộ lọc</div>}
        </div>
        <div className="hidden overflow-auto md:block">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {["Ảnh", "Điện thoại", "Tình trạng", "Lỗi", "Giá nhập", "Vận chuyển", "Chi phí thay", "Tổng vốn", ""].map((header) => (
                <th className="px-4 py-3 font-semibold" key={header}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedPhones.items.map((phone) => {
              const repairIds = new Set(props.repairs.filter((repair) => repair.phoneId === phone.id).map((repair) => repair.id));
              const partCost = props.repairParts
                .filter((part) => repairIds.has(part.repairId))
                .reduce((sum, part) => sum + part.quantity * part.unitCost, 0);
              const laborCost = props.repairs
                .filter((repair) => repair.phoneId === phone.id)
                .reduce((sum, repair) => sum + repair.laborCost, 0);
              const extraCost = props.expenses
                .filter((expense) => expense.phoneId === phone.id)
                .reduce((sum, expense) => sum + expense.amount, 0);
              const replacementCost = partCost + laborCost + extraCost;
              const totalCost = phoneCost(phone, props.repairs, props.repairParts, props.expenses);
              return (
                <tr className="border-t" key={phone.id}>
                  <td className="px-4 py-3">
                    {phone.imageFront ? (
                      <img className="h-14 w-14 rounded-md object-cover" src={phone.imageFront} alt={`${phone.brand} ${phone.model}`} />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-md bg-muted text-slate-400">
                        <Smartphone size={20} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {phone.brand} {phone.model}
                    </div>
                    <div className="text-xs text-slate-500">
                      {phone.sellerName ? `Người mua: ${phone.sellerName}` : "Chưa có tên người mua"}
                    </div>
                    {phone.imei1 && <div className="text-xs text-slate-500">IMEI: {phone.imei1}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={phone.status} />
                  </td>
                  <td className="px-4 py-3">
                    {props.faults
                      .filter((fault) => fault.phoneId === phone.id)
                      .map((fault) => fault.faultName)
                      .join(", ") || "Không có"}
                  </td>
                  <td className="px-4 py-3">{currency(phone.purchasePrice, props.settings.currency)}</td>
                  <td className="px-4 py-3">{currency(phone.shippingFee ?? 0, props.settings.currency)}</td>
                  <td className="px-4 py-3">{currency(replacementCost, props.settings.currency)}</td>
                  <td className="px-4 py-3 font-semibold">{currency(totalCost, props.settings.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary" onClick={() => props.onRepair(phone)}>
                        <Wrench size={16} />
                        Thay linh kiện
                      </button>
                      <button className="btn-secondary" onClick={() => props.onEdit(phone)}>
                        Sửa
                      </button>
                      <button className="btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => props.onDelete(phone)}>
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginatedPhones.items.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                  Không có điện thoại phù hợp bộ lọc
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <PaginationControls
          page={paginatedPhones.page}
          totalPages={paginatedPhones.totalPages}
          pageSize={pageSize}
          totalItems={filteredPhones.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

function PartsView({ parts, onEdit, onDelete }: { parts: Part[]; onEdit: (part: Part) => void; onDelete: (part: Part) => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const brands = uniqueValues(parts.map((part) => part.brand));
  const categories = uniqueValues(parts.map((part) => part.category));
  const filteredParts = parts.filter((part) => {
    const text = [part.brand, part.name, part.category, part.compatibleModels, part.supplier, part.notes]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = text.includes(searchTerm.toLowerCase());
    const matchesBrand = brandFilter === "all" || part.brand === brandFilter;
    const matchesCategory = categoryFilter === "all" || part.category === categoryFilter;
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low" && part.quantity <= part.minimumStock) ||
      (stockFilter === "available" && part.quantity > 0);
    return matchesSearch && matchesBrand && matchesCategory && matchesStock;
  });
  const paginatedParts = paginate(filteredParts, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, brandFilter, categoryFilter, stockFilter, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Kho linh kiện</h2>
          <p className="text-sm text-slate-500">{filteredParts.length}/{parts.length} linh kiện</p>
        </div>
        <button className="btn-primary" onClick={() => onEdit(blankPart())}>
          <PackagePlus size={18} />
          Thêm linh kiện
        </button>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <input
            className="field"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Tìm tên linh kiện, hãng, model, nhà cung cấp"
          />
          <select className="field" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="all">Tất cả hãng</option>
            {brands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <select className="field" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">Tất cả danh mục</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select className="field" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            <option value="all">Tất cả tồn kho</option>
            <option value="available">Còn hàng</option>
            <option value="low">Sắp hết</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="space-y-3 p-3 md:hidden">
          {paginatedParts.items.map((part) => (
            <div className="rounded-lg border bg-background p-3" key={part.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-500">{part.brand || "Không rõ hãng"}</p>
                  <h3 className="truncate font-semibold">{part.name}</h3>
                  <p className="text-sm text-slate-500">{part.category}</p>
                </div>
                <div className={cn("rounded-md bg-muted px-2 py-1 text-sm font-semibold", part.quantity <= part.minimumStock && "text-red-600")}>
                  Tồn {part.quantity}
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <p className="line-clamp-2">Model: {part.compatibleModels || "-"}</p>
                <p>Giá nhập: {currency(part.purchaseCost)}</p>
                <p>Tối thiểu: {part.minimumStock}</p>
                {part.supplier && <p>Nhà cung cấp: {part.supplier}</p>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn-secondary w-full" onClick={() => onEdit(part)}>
                  Sửa
                </button>
                <button className="btn-secondary w-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => onDelete(part)}>
                  Xoá
                </button>
              </div>
            </div>
          ))}
          {paginatedParts.items.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Không có linh kiện phù hợp bộ lọc</div>}
        </div>
        <div className="hidden max-h-[68vh] overflow-auto md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left">
              <tr>
                {["Hãng", "Linh kiện", "Danh mục", "Model tương thích", "Tồn", "Tối thiểu", "Giá nhập", "Nhà cung cấp", ""].map(
                  (header) => (
                    <th className="px-4 py-3 font-semibold" key={header}>
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedParts.items.map((part) => (
                <tr className="border-t" key={part.id}>
                  <td className="px-4 py-3 font-medium">{part.brand || "-"}</td>
                  <td className="px-4 py-3">{part.name}</td>
                  <td className="px-4 py-3">{part.category}</td>
                  <td className="px-4 py-3">{part.compatibleModels || "-"}</td>
                  <td className={cn("px-4 py-3 font-semibold", part.quantity <= part.minimumStock && "text-red-600")}>
                    {part.quantity}
                  </td>
                  <td className="px-4 py-3">{part.minimumStock}</td>
                  <td className="px-4 py-3">{currency(part.purchaseCost)}</td>
                  <td className="px-4 py-3">{part.supplier || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary h-9" onClick={() => onEdit(part)}>
                        Sửa
                      </button>
                      <button className="btn-secondary h-9 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => onDelete(part)}>
                        Xoá
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedParts.items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                    Không có linh kiện phù hợp bộ lọc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={paginatedParts.page}
          totalPages={paginatedParts.totalPages}
          pageSize={pageSize}
          totalItems={filteredParts.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}

function SalesView({
  phones,
  customers,
  sales,
  settings,
  repairs,
  repairParts,
  expenses,
  onDelete,
  onSave
}: {
  phones: Phone[];
  customers: { id: string; name: string; phone: string }[];
  sales: Sale[];
  settings: Settings;
  repairs: Repair[];
  repairParts: RepairPart[];
  expenses: Expense[];
  onDelete: (sale: Sale) => void;
  onSave: (input: {
    phoneId: string;
    customerName: string;
    customerPhone: string;
    salePrice: number;
    saleDate: string;
    warrantyMonths: number;
    notes: string;
  }) => void;
}) {
  const sellablePhones = phones.filter((phone) => phone.status === "Ready For Sale" || phone.status === "Reserved");
  const [draft, setDraft] = useState({
    phoneId: sellablePhones[0]?.id ?? "",
    customerName: "",
    customerPhone: "",
    salePrice: 0,
    saleDate: todayISO(),
    warrantyMonths: settings.defaultWarranty,
    notes: ""
  });
  const selectedPhone = phones.find((phone) => phone.id === draft.phoneId);
  const selectedCost = selectedPhone ? phoneCost(selectedPhone, repairs, repairParts, expenses) : 0;
  const expectedProfit = Number(draft.salePrice || 0) - selectedCost;
  async function submit() {
    await onSave(draft);
    setDraft({
      ...draft,
      customerName: "",
      customerPhone: "",
      salePrice: 0,
      notes: ""
    });
  }
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <form
        className="card space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-semibold">Cập nhật giá bán ra</h2>
        <select className="field" value={draft.phoneId} onChange={(e) => setDraft({ ...draft, phoneId: e.target.value })}>
          {sellablePhones.map((phone) => (
            <option key={phone.id} value={phone.id}>
              {phone.brand} {phone.model} - vốn {currency(phoneCost(phone, repairs, repairParts, expenses), settings.currency)}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Tổng vốn" value={currency(selectedCost, settings.currency)} />
          <Stat label="Lãi dự kiến" value={currency(expectedProfit, settings.currency)} warn={expectedProfit < 0} />
        </div>
        <input className="field" placeholder="Tên khách hàng" value={draft.customerName} onChange={(e) => setDraft({ ...draft, customerName: e.target.value })} required />
        <input className="field" placeholder="Số điện thoại khách" value={draft.customerPhone} onChange={(e) => setDraft({ ...draft, customerPhone: e.target.value })} required />
        <MoneyInput
          placeholder="Giá bán ra"
          value={draft.salePrice}
          onChange={(salePrice) => setDraft({ ...draft, salePrice })}
          required
        />
        <input className="field" type="date" value={draft.saleDate} onChange={(e) => setDraft({ ...draft, saleDate: e.target.value })} />
        <NumericInput value={draft.warrantyMonths} onChange={(warrantyMonths) => setDraft({ ...draft, warrantyMonths })} />
        <button className="btn-primary w-full">Lưu bán hàng</button>
      </form>
      <div className="card overflow-hidden xl:col-span-2">
        <div className="space-y-3 p-3 md:hidden">
          {sales.map((sale) => {
            const phone = phones.find((item) => item.id === sale.phoneId);
            const customer = customers.find((item) => item.id === sale.customerId);
            return (
              <div className="rounded-lg border bg-background p-3" key={sale.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{sale.saleDate}</p>
                    <h3 className="truncate font-semibold">{phone ? `${phone.brand} ${phone.model}` : "Không rõ"}</h3>
                    <p className="truncate text-sm text-slate-500">{customer?.name ?? "Không rõ khách hàng"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{currency(sale.salePrice, settings.currency)}</p>
                    <p className="text-xs text-slate-500">{sale.warrantyMonths} tháng</p>
                  </div>
                </div>
                <button className="btn-secondary mt-3 w-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => onDelete(sale)}>
                  Xoá
                </button>
              </div>
            );
          })}
          {sales.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Chưa có đơn bán hàng</div>}
        </div>
        <div className="hidden overflow-auto md:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {["Ngày", "Điện thoại", "Khách hàng", "Giá bán ra", "Bảo hành", ""].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const phone = phones.find((item) => item.id === sale.phoneId);
                const customer = customers.find((item) => item.id === sale.customerId);
                return (
                  <tr className="border-t" key={sale.id}>
                    <td className="px-4 py-3">{sale.saleDate}</td>
                    <td className="px-4 py-3">{phone ? `${phone.brand} ${phone.model}` : "Không rõ"}</td>
                    <td className="px-4 py-3">{customer?.name ?? "Không rõ"}</td>
                    <td className="px-4 py-3">{currency(sale.salePrice, settings.currency)}</td>
                    <td className="px-4 py-3">{sale.warrantyMonths} tháng</td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn-secondary h-9 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => onDelete(sale)}>
                        Xoá
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CustomersView({
  customers,
  sales,
  phones,
  onDelete
}: {
  customers: { id: string; name: string; phone: string; notes?: string }[];
  sales: Sale[];
  phones: Phone[];
  onDelete: (customerId: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {customers.map((customer) => {
        const customerSales = sales.filter((sale) => sale.customerId === customer.id);
        return (
          <div className="card p-4" key={customer.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{customer.name}</h3>
                <p className="text-sm text-slate-500">{customer.phone}</p>
              </div>
              <button className="btn-secondary h-9 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={() => onDelete(customer.id)}>
                Xoá
              </button>
            </div>
            <div className="mt-3 space-y-1 text-sm">
              {customerSales.map((sale) => {
                const phone = phones.find((item) => item.id === sale.phoneId);
                return <p key={sale.id}>{phone ? `${phone.brand} ${phone.model}` : "Không rõ điện thoại"}</p>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportsView(props: {
  phones: Phone[];
  repairs: Repair[];
  repairParts: RepairPart[];
  expenses: Expense[];
  sales: Sale[];
  settings: Settings;
  onBackup: () => void;
  onRestore: (file?: File) => void;
  onPushLocal: () => void;
}) {
  const rows = props.sales.map((sale) => {
    const phone = props.phones.find((item) => item.id === sale.phoneId);
    const profit = saleProfit(sale, props.phones, props.repairs, props.repairParts, props.expenses);
    return [
      sale.saleDate,
      phone ? `${phone.brand} ${phone.model}` : "Không rõ",
      currency(sale.salePrice, props.settings.currency),
      currency(profit, props.settings.currency),
      `${sale.salePrice ? Math.round((profit / sale.salePrice) * 100) : 0}%`
    ];
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={props.onBackup}>
          <Download size={18} />
          Sao lưu JSON
        </button>
        <label className="btn-secondary cursor-pointer">
          <Upload size={18} />
          Khôi phục JSON
          <input className="hidden" type="file" accept="application/json" onChange={(e) => props.onRestore(e.target.files?.[0])} />
        </label>
        <button className="btn-secondary" onClick={props.onPushLocal}>
          <Upload size={18} />
          Đẩy dữ liệu hiện tại lên Supabase
        </button>
      </div>
      <div className="card overflow-hidden">
        <DataTable headers={["Ngày", "Điện thoại", "Doanh thu", "Lợi nhuận", "Biên lợi nhuận"]} rows={rows} />
      </div>
    </div>
  );
}

function SettingsView({
  settings,
  supabaseConfigured,
  onChange
}: {
  settings: Settings;
  supabaseConfigured: boolean;
  onChange: (settings: Settings) => void;
}) {
  return (
    <form className="card max-w-2xl space-y-4 p-4">
      <h2 className="text-lg font-semibold">Cài đặt</h2>
      <Labeled label="Tên cửa hàng">
        <input className="field" value={settings.businessName} onChange={(e) => onChange({ ...settings, businessName: e.target.value })} />
      </Labeled>
      <Labeled label="Tiền tệ">
        <input className="field" value="VND" readOnly />
      </Labeled>
      <Labeled label="Bảo hành mặc định">
        <NumericInput value={settings.defaultWarranty} onChange={(defaultWarranty) => onChange({ ...settings, defaultWarranty, currency: "VND" })} />
      </Labeled>
      <div className="rounded-md bg-muted p-3 text-sm">
        Đồng bộ Supabase: {supabaseConfigured ? "Đã cấu hình" : "Thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY để bật phần kết nối đồng bộ đám mây."}
      </div>
    </form>
  );
}

function PhoneDialog({
  phone,
  phones,
  faults,
  onClose,
  onSave
}: {
  phone: Phone;
  phones: Phone[];
  faults: { faultName: string }[];
  onClose: () => void;
  onSave: (phone: Phone, faultNames: string[]) => void;
}) {
  const [draft, setDraft] = useState(phone);
  const [faultText, setFaultText] = useState(faults.map((fault) => fault.faultName).join(", "));
  const brandOptions = uniqueValues(phones.map((item) => item.brand));
  const modelOptions = uniqueValues(
    phones
      .filter((item) => !draft.brand || item.brand.toLowerCase() === draft.brand.toLowerCase())
      .map((item) => item.model)
  );
  return (
    <Modal title="Nhập hàng điện thoại cũ" onClose={onClose}>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(
            draft.status === "Purchased" && faultText.trim() ? { ...draft, status: "Waiting Repair" } : draft,
            faultText.split(",")
          );
        }}
      >
        <SuggestInput
          label="Hãng"
          value={draft.brand}
          options={brandOptions}
          listId="phone-brand-options"
          placeholder="Chọn hãng có sẵn hoặc nhập hãng mới"
          onChange={(brand) => setDraft({ ...draft, brand })}
          required
        />
        <SuggestInput
          label="Model"
          value={draft.model}
          options={modelOptions}
          listId="phone-model-options"
          placeholder="Chọn model có sẵn hoặc nhập model mới"
          onChange={(model) => setDraft({ ...draft, model })}
          required
        />
        <Input label="Tên người mua" value={draft.sellerName ?? ""} onChange={(sellerName) => setDraft({ ...draft, sellerName })} required />
        <MoneyInput label="Giá mua" value={draft.purchasePrice} onChange={(purchasePrice) => setDraft({ ...draft, purchasePrice })} />
        <MoneyInput label="Phí vận chuyển" value={draft.shippingFee ?? 0} onChange={(shippingFee) => setDraft({ ...draft, shippingFee })} />
        <label className="md:col-span-2">
          <span className="label">Tình trạng</span>
          <textarea
            className="field min-h-20 py-3"
            value={faultText}
            onChange={(e) => setFaultText(e.target.value)}
            placeholder="Ví dụ: vỡ màn hình, pin yếu, lỗi camera"
          />
        </label>
        <label className="md:col-span-2">
          <span className="label">Ảnh sản phẩm</span>
          <div className="mt-1 grid gap-3 rounded-lg border bg-background p-3 md:grid-cols-[160px_1fr]">
            {draft.imageFront ? (
              <img className="h-36 w-full rounded-md object-cover" src={draft.imageFront} alt={`${draft.brand} ${draft.model}`} />
            ) : (
              <div className="flex h-36 items-center justify-center rounded-md bg-muted text-slate-400">
                <Smartphone size={32} />
              </div>
            )}
            <div className="flex flex-col justify-center gap-2">
              <input
                className="field pt-2"
                type="file"
                accept="image/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setDraft({ ...draft, imageFront: await fileToDataUrl(file) });
                }}
              />
              <p className="text-sm text-slate-500">Ảnh được lưu trong dữ liệu offline và sẽ đi kèm khi sao lưu JSON.</p>
            </div>
          </div>
        </label>
        <label className="md:col-span-2">
          <span className="label">Ghi chú</span>
          <textarea className="field min-h-24 py-3" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
        <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 md:col-span-2 md:grid-cols-2">
          <Input label="IMEI 1 tùy chọn" value={draft.imei1} onChange={(imei1) => setDraft({ ...draft, imei1 })} />
          <Input label="IMEI 2 tùy chọn" value={draft.imei2 ?? ""} onChange={(imei2) => setDraft({ ...draft, imei2 })} />
          <Input label="Ngày mua" type="date" value={draft.purchaseDate} onChange={(purchaseDate) => setDraft({ ...draft, purchaseDate })} />
          <Labeled label="Trạng thái">
            <select className="field" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as PhoneStatus })}>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
          </Labeled>
          <Input label="Màu sắc" value={draft.color ?? ""} onChange={(color) => setDraft({ ...draft, color })} />
          <Input label="Dung lượng" value={draft.storage ?? ""} onChange={(storage) => setDraft({ ...draft, storage })} />
        </div>
        <div className="flex justify-end gap-2 md:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary">Lưu</button>
        </div>
      </form>
    </Modal>
  );
}

function RepairDialog({
  phone,
  parts,
  repairs,
  repairParts,
  expenses,
  settings,
  onClose,
  onSave
}: {
  phone: Phone;
  parts: Part[];
  repairs: Repair[];
  repairParts: RepairPart[];
  expenses: Expense[];
  settings: Settings;
  onClose: () => void;
  onSave: (input: {
    phone: Phone;
    description: string;
    technician: string;
    laborCost: number;
    notes: string;
    selectedParts: { part: Part; quantity: number }[];
  }) => void;
}) {
  const [description, setDescription] = useState("Thay linh kiện hư hỏng");
  const [technician, setTechnician] = useState("");
  const [laborCost, setLaborCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [partSearch, setPartSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("available");
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const brands = uniqueValues(parts.map((part) => part.brand));
  const categories = uniqueValues(parts.map((part) => part.category));
  const selectedParts = parts
    .map((part) => ({ part, quantity: quantities[part.id] ?? 0 }))
    .filter((item) => item.quantity > 0);
  const filteredParts = parts
    .filter((part) => {
      const text = [part.brand, part.name, part.category, part.compatibleModels, part.supplier, part.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = text.includes(partSearch.toLowerCase());
      const matchesBrand = brandFilter === "all" || part.brand === brandFilter;
      const matchesCategory = categoryFilter === "all" || part.category === categoryFilter;
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "available" && part.quantity > 0) ||
        (stockFilter === "low" && part.quantity <= part.minimumStock);
      const matchesCompatibility = !compatibleOnly || isPartRecommendedForPhone(part, phone);
      return matchesSearch && matchesBrand && matchesCategory && matchesStock && matchesCompatibility;
    })
    .sort((a, b) => {
      const selectedDelta = Number((quantities[b.id] ?? 0) > 0) - Number((quantities[a.id] ?? 0) > 0);
      if (selectedDelta) return selectedDelta;
      const recommendedDelta = Number(isPartRecommendedForPhone(b, phone)) - Number(isPartRecommendedForPhone(a, phone));
      if (recommendedDelta) return recommendedDelta;
      return `${a.brand ?? ""} ${a.category} ${a.name}`.localeCompare(`${b.brand ?? ""} ${b.category} ${b.name}`);
    });
  const currentCost = phoneCost(phone, repairs, repairParts, expenses);
  const selectedPartCost = selectedParts.reduce((sum, item) => sum + item.part.purchaseCost * item.quantity, 0);
  const newTotalCost = currentCost + selectedPartCost + Number(laborCost || 0);
  return (
    <Modal title={`Thay linh kiện - ${phone.brand} ${phone.model}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            phone,
            description,
            technician,
            laborCost: Number(laborCost || 0),
            notes,
            selectedParts
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <Stat label="Giá nhập máy" value={currency(phone.purchasePrice, settings.currency)} />
          <Stat label="Chi phí hiện tại" value={currency(currentCost, settings.currency)} />
          <Stat label="Tổng vốn sau thay" value={currency(newTotalCost, settings.currency)} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Input label="Nội dung sửa chữa" value={description} onChange={setDescription} required />
          <Input label="Kỹ thuật viên" value={technician} onChange={setTechnician} />
          <MoneyInput label="Công sửa" value={laborCost} onChange={setLaborCost} />
          <label>
            <span className="label">Ghi chú sửa chữa</span>
            <textarea className="field min-h-20 py-3" value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <input
              className="field"
              value={partSearch}
              onChange={(event) => setPartSearch(event.target.value)}
              placeholder="Tìm linh kiện, hãng, model tương thích"
            />
            <select className="field" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              <option value="all">Tất cả hãng</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
            <select className="field" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="all">Tất cả danh mục</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select className="field" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
              <option value="available">Chỉ còn hàng</option>
              <option value="all">Tất cả tồn kho</option>
              <option value="low">Sắp hết</option>
            </select>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compatibleOnly}
              onChange={(event) => setCompatibleOnly(event.target.checked)}
            />
            Ưu tiên chỉ hiện linh kiện khớp hãng/model máy đang sửa
          </label>
        </div>

        {selectedParts.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
            <p className="mb-2 text-sm font-semibold">Linh kiện đã chọn</p>
            <div className="flex flex-wrap gap-2">
              {selectedParts.map(({ part, quantity }) => (
                <span className="inline-flex items-center gap-2 rounded-md bg-card px-2 py-1 text-sm" key={part.id}>
                  <span>
                    {part.brand ? `${part.brand} - ` : ""}
                    {part.name} x{quantity}
                  </span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md border hover:bg-muted"
                    aria-label={`Bỏ chọn ${part.name}`}
                    onClick={() => setQuantities({ ...quantities, [part.id]: 0 })}
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-lg border">
          <div className="max-h-[46vh] overflow-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left">
              <tr>
                {["Gợi ý", "Hãng", "Linh kiện", "Danh mục", "Tương thích", "Tồn kho", "Giá nhập", "Số lượng thay", "Thành tiền"].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredParts.map((part) => {
                const quantity = quantities[part.id] ?? 0;
                const recommended = isPartRecommendedForPhone(part, phone);
                return (
                  <tr className="border-t" key={part.id}>
                    <td className="px-4 py-3">
                      {recommended ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                          Khớp máy
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{part.brand || "-"}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{part.name}</div>
                      <div className="text-xs text-slate-500">{part.supplier || "Chưa có nhà cung cấp"}</div>
                    </td>
                    <td className="px-4 py-3">{part.category}</td>
                    <td className="px-4 py-3">{part.compatibleModels || "-"}</td>
                    <td className={cn("px-4 py-3 font-semibold", part.quantity <= part.minimumStock && "text-red-600")}>
                      {part.quantity}
                    </td>
                    <td className="px-4 py-3">{currency(part.purchaseCost, settings.currency)}</td>
                    <td className="px-4 py-3">
                      <input
                        className="field h-9 max-w-28"
                        type="text"
                        inputMode="numeric"
                        min={0}
                        max={part.quantity}
                        value={quantity === 0 ? "" : String(quantity)}
                        onChange={(event) =>
                          setQuantities({
                            ...quantities,
                            [part.id]: Math.min(part.quantity, Math.max(0, Number(event.target.value.replace(/\D/g, ""))))
                          })
                        }
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {quantity > 0 ? currency(quantity * part.purchaseCost, settings.currency) : "-"}
                    </td>
                  </tr>
                );
              })}
              {filteredParts.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                    Không có linh kiện phù hợp bộ lọc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        <div className="rounded-md bg-muted p-3 text-sm">
          Giá bán đề xuất sẽ bổ sung sau. Hiện tại hệ thống chỉ tính tổng vốn để bạn tự quyết định giá bán ra.
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary" disabled={selectedParts.length === 0 && Number(laborCost || 0) === 0}>
            Lưu thay linh kiện
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PartDialog({
  part,
  parts,
  onClose,
  onSave
}: {
  part: Part;
  parts: Part[];
  onClose: () => void;
  onSave: (part: Part) => void;
}) {
  const [draft, setDraft] = useState(part);
  const brandOptions = uniqueValues(parts.map((item) => item.brand));
  const categoryOptions = uniqueValues(parts.map((item) => item.category));
  const modelOptions = uniqueValues(
    parts
      .flatMap((item) => item.compatibleModels?.split(",") ?? [])
      .map((model) => model.trim())
  );
  return (
    <Modal title="Thông tin linh kiện" onClose={onClose}>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <SuggestInput
          label="Hãng linh kiện"
          value={draft.brand ?? ""}
          options={brandOptions}
          listId="part-brand-options"
          placeholder="Chọn hãng có sẵn hoặc nhập hãng mới"
          onChange={(brand) => setDraft({ ...draft, brand })}
        />
        <Input label="Tên" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} required />
        <SuggestInput
          label="Danh mục"
          value={draft.category}
          options={categoryOptions}
          listId="part-category-options"
          placeholder="Chọn danh mục có sẵn hoặc nhập danh mục mới"
          onChange={(category) => setDraft({ ...draft, category })}
          required
        />
        <SuggestInput
          label="Model tương thích"
          value={draft.compatibleModels ?? ""}
          options={modelOptions}
          listId="part-model-options"
          placeholder="Chọn model có sẵn hoặc nhập model mới"
          onChange={(compatibleModels) => setDraft({ ...draft, compatibleModels })}
        />
        <Input label="Nhà cung cấp" value={draft.supplier ?? ""} onChange={(supplier) => setDraft({ ...draft, supplier })} />
        <MoneyInput label="Giá nhập" value={draft.purchaseCost} onChange={(purchaseCost) => setDraft({ ...draft, purchaseCost })} />
        <NumericInput label="Số lượng" value={draft.quantity} onChange={(quantity) => setDraft({ ...draft, quantity })} />
        <NumericInput label="Tồn tối thiểu" value={draft.minimumStock} onChange={(minimumStock) => setDraft({ ...draft, minimumStock })} />
        <label className="md:col-span-2">
          <span className="label">Ghi chú</span>
          <textarea className="field min-h-20 py-3" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <div className="flex justify-end gap-2 md:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary">Lưu</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 md:items-center md:justify-center md:p-6">
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-lg bg-card p-4 shadow-xl md:max-w-6xl md:rounded-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-secondary h-9" onClick={onClose}>
            Đóng
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  required
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <Labeled label={label}>
      <input className="field" type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </Labeled>
  );
}

function formatMoneyInput(value: number) {
  if (!value) return "";
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: 0
  }).format(value);
}

function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
  required
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const input = (
    <input
      className="field"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatMoneyInput(value)}
      placeholder={placeholder}
      required={required}
      onChange={(event) => {
        const numericText = event.target.value.replace(/\D/g, "");
        onChange(numericText ? Number(numericText) : 0);
      }}
    />
  );

  if (!label) return input;
  return <Labeled label={label}>{input}</Labeled>;
}

function NumericInput({
  label,
  value,
  onChange,
  placeholder,
  required
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const input = (
    <input
      className="field"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value === 0 ? "" : String(value)}
      placeholder={placeholder}
      required={required}
      onChange={(event) => {
        const numericText = event.target.value.replace(/\D/g, "");
        onChange(numericText ? Number(numericText) : 0);
      }}
    />
  );

  if (!label) return input;
  return <Labeled label={label}>{input}</Labeled>;
}

function SuggestInput({
  label,
  value,
  options,
  listId: _listId,
  placeholder,
  onChange,
  required
}: {
  label: string;
  value: string;
  options: string[];
  listId: string;
  placeholder?: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const normalizedValue = value.trim().toLowerCase();
  const visibleOptions = options
    .filter((option) => !normalizedValue || option.toLowerCase().includes(normalizedValue))
    .slice(0, 12);

  return (
    <Labeled label={label}>
      <div className="relative">
        <input
          className="field pr-10"
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          required={required}
        />
        <button
          type="button"
          className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted"
          aria-label="Mở danh sách gợi ý"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((current) => !current)}
        >
          <Search size={16} />
        </button>
        {open && visibleOptions.length > 0 && (
          <div className="absolute z-[70] mt-1 max-h-64 w-full overflow-auto rounded-md border bg-card p-1 shadow-lg">
            {visibleOptions.map((option) => (
              <button
                type="button"
                className="block min-h-10 w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                key={option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </Labeled>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-muted text-left">
          <tr>
            {headers.map((header) => (
              <th className="px-4 py-3 font-semibold" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-center text-slate-500" colSpan={headers.length}>
                Chưa có dữ liệu
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr className="border-t" key={index}>
                {row.map((cell, cellIndex) => (
                  <td className="px-4 py-3" key={`${index}-${cellIndex}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaginationControls({
  page,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const start = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
      <div className="text-slate-500">
        Hiển thị {start}-{end} / {totalItems}
      </div>
      <div className="flex items-center gap-2">
        <select className="field h-9 w-28" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {[10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}/trang
            </option>
          ))}
        </select>
        <button className="btn-secondary h-9" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Trước
        </button>
        <span className="min-w-20 text-center">
          {page}/{totalPages}
        </span>
        <button className="btn-secondary h-9" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Sau
        </button>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PhoneStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "Sold" && "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
        status === "Ready For Sale" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
        status.includes("Repair") && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
        status === "Purchased" && "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
        status === "Reserved" && "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-md bg-muted p-3", warn && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200")}>
      <p className="label">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
