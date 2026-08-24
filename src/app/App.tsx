import {
  Boxes,
  CircleDollarSign,
  Download,
  Eye,
  LockKeyhole,
  LogOut,
  Moon,
  PackagePlus,
  PanelLeft,
  Pencil,
  Search,
  Smartphone,
  Sun,
  Trash2,
  Upload,
  Wrench
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
import { buildMetrics, monthlySeries, phoneCost, saleProfit } from "../lib/calculations";
import { supabase } from "../lib/supabase";
import {
  deleteRemoteWhere,
  fetchAppLogs,
  fetchDeletedRows,
  fetchSupabaseData,
  pushBackupToSupabase,
  remoteUpsert,
  restoreRemoteRow,
  softDeleteRemoteRow,
  softDeleteRemoteWhere
} from "../lib/supabaseSync";
import type {
  AppLog,
  BackupPayload,
  Customer,
  DeletedRow,
  Expense,
  Part,
  PartImport,
  Phone,
  PhoneFault,
  PhoneStatus,
  Repair,
  RepairPart,
  Sale,
  SaleDeliveryStatus,
  Settings
} from "../lib/types";
import {
  authSessionDeadlineKey,
  defaultSettings,
  deliveryStatuses,
  deliveryStatusLabels,
  entityTypeLabels,
  logActionLabels,
  loginDurationMs,
  preRepairStatuses,
  repairWorkflowStatuses,
  statusLabels,
  stockReservedRepairStatuses
} from "../domain/constants";
import { blankPart, blankPartImport, blankPhone } from "../domain/factories";
import { applyPartQuantityDelta, getPhoneRepairPartUsage } from "../domain/repairInventory";
import {
  formatDateTimeText,
  formatSaleDateTime,
  normalizeCustomerIdentity,
  paginate,
  uniqueValues
} from "../shared/helpers";
import {
  ActionMenu,
  DataTable,
  Labeled,
  Modal,
  MoneyInput,
  NumericInput,
  PaginationControls,
  Stat,
  StatusPill,
  TrashSection
} from "../shared/ui";
import { PartDialog, PartImportDialog, PhoneDialog, RepairDialog } from "../features/dialogs";
import { navItems, type View } from "./navigation";
import { cn, currency, nowLocalDateTime, todayISO, uid } from "../lib/utils";

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
  const [partImportDraft, setPartImportDraft] = useState<{ part: Part; partImport: PartImport } | null>(null);
  const [repairPhone, setRepairPhone] = useState<Phone | null>(null);
  const [salePhoneId, setSalePhoneId] = useState("");
  const [salePriceDraft, setSalePriceDraft] = useState(0);
  const [repairSaving, setRepairSaving] = useState(false);
  const [syncMessage, setSyncMessage] = useState(supabase ? "Đang kết nối Supabase..." : "Chưa cấu hình Supabase");
  const searchRef = useRef<HTMLInputElement>(null);
  const repairSavingRef = useRef(false);
  const operationLocksRef = useRef(new Set<string>());

  const [phones, setPhones] = useState<Phone[]>([]);
  const [faults, setFaults] = useState<PhoneFault[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [partImports, setPartImports] = useState<PartImport[]>([]);
  const [repairParts, setRepairParts] = useState<RepairPart[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [appLogs, setAppLogs] = useState<AppLog[]>([]);
  const [deletedRows, setDeletedRows] = useState<DeletedRow[]>([]);

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
    setPartImports([]);
    setRepairParts([]);
    setExpenses([]);
    setCustomers([]);
    setSales([]);
    setAppLogs([]);
    setDeletedRows([]);
    setSettings(defaultSettings);
    setQuery("");
    setPhoneDraft(null);
    setPartDraft(null);
    setPartImportDraft(null);
    setRepairPhone(null);
  }

  async function loadRemoteState() {
    const payload = await fetchSupabaseData();
    setPhones(payload.phones);
    setFaults(payload.faults);
    setRepairs(payload.repairs);
    setParts(payload.parts);
    setPartImports(payload.partImports ?? []);
    setRepairParts(payload.repairParts);
    setExpenses(payload.expenses);
    setCustomers(payload.customers);
    setSales(payload.sales);
    setSettings({ ...(payload.settings[0] ?? defaultSettings), currency: "VND" });
    setAppLogs((await fetchAppLogs()).slice(0, 100));
    setDeletedRows(await fetchDeletedRows());
  }

  async function refreshAuditState() {
    setAppLogs((await fetchAppLogs()).slice(0, 100));
    setDeletedRows(await fetchDeletedRows());
  }

  async function writeLog(action: string, entityType: string, entityId: string | undefined, message: string) {
    const log: AppLog = {
      id: uid("log"),
      action,
      entityType,
      entityId,
      message,
      createdAt: new Date().toISOString()
    };
    try {
      await remoteUpsert.log(log);
      setAppLogs((current) => [log, ...current].slice(0, 100));
    } catch (error) {
      console.error(error);
    }
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
        await loadRemoteState();
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
  const trashFor = (tables: string[]) => deletedRows.filter((row) => tables.includes(row.table));

  function beginOperation(key: string) {
    if (operationLocksRef.current.has(key)) {
      setSyncMessage("Thao tác trước đó vẫn đang xử lý, vui lòng chờ trong giây lát.");
      return false;
    }
    operationLocksRef.current.add(key);
    return true;
  }

  function finishOperation(key: string) {
    operationLocksRef.current.delete(key);
  }

  function beginOperations(keys: string[]) {
    const uniqueKeys = Array.from(new Set(keys));
    if (uniqueKeys.some((key) => operationLocksRef.current.has(key))) {
      setSyncMessage("Thao tác liên quan vẫn đang xử lý, vui lòng chờ trong giây lát.");
      return false;
    }
    uniqueKeys.forEach((key) => operationLocksRef.current.add(key));
    return true;
  }

  function finishOperations(keys: string[]) {
    Array.from(new Set(keys)).forEach((key) => operationLocksRef.current.delete(key));
  }

  async function savePhone(phone: Phone, faultNames: string[]) {
    const lockKey = `save-phone:${phone.id}`;
    if (!beginOperation(lockKey)) return;
    const existingPhone = phones.find((item) => item.id === phone.id);
    const shouldCancelRepairParts =
      existingPhone &&
      stockReservedRepairStatuses.includes(existingPhone.status) &&
      preRepairStatuses.includes(phone.status);
    const cancelledRepairUsage = shouldCancelRepairParts ? getPhoneRepairPartUsage(phone.id, repairs, repairParts) : null;
    const restoredParts = cancelledRepairUsage ? applyPartQuantityDelta(parts, cancelledRepairUsage.quantities, "increase") : [];
    const partLockKeys = restoredParts.map((part) => `part:${part.id}`);
    if (partLockKeys.length > 0 && !beginOperations(partLockKeys)) {
      finishOperation(lockKey);
      return;
    }
    const savedPhone = { ...phone, updatedAt: new Date().toISOString() };
    const faultsToSave = faultNames
      .map((faultName) => faultName.trim())
      .filter(Boolean)
      .map((faultName) => ({ id: uid("fault"), phoneId: phone.id, faultName }));
    try {
      await Promise.all(restoredParts.map((part) => remoteUpsert.part(part)));
      if (cancelledRepairUsage) {
        await Promise.all(cancelledRepairUsage.repairIds.map((repairId) => softDeleteRemoteWhere("repair_parts", "repair_id", repairId)));
        await softDeleteRemoteWhere("repairs", "phone_id", phone.id);
      }
      await remoteUpsert.phone(savedPhone);
      await deleteRemoteWhere("phone_faults", "phone_id", phone.id);
      await Promise.all(faultsToSave.map((fault) => remoteUpsert.fault(fault)));
      setPhones((current) => [...current.filter((item) => item.id !== savedPhone.id), savedPhone]);
      if (restoredParts.length > 0) {
        setParts((current) => current.map((part) => restoredParts.find((restoredPart) => restoredPart.id === part.id) ?? part));
      }
      if (cancelledRepairUsage) {
        setRepairs((current) => current.filter((repair) => repair.phoneId !== phone.id));
        setRepairParts((current) => current.filter((repairPart) => !cancelledRepairUsage.repairIds.includes(repairPart.repairId)));
      }
      setFaults((current) => [...current.filter((fault) => fault.phoneId !== phone.id), ...faultsToSave]);
      await writeLog("save", "phones", savedPhone.id, `Lưu điện thoại ${savedPhone.brand} ${savedPhone.model}`);
      if (restoredParts.length > 0) {
        await writeLog("update", "parts", savedPhone.id, `Hoàn linh kiện khi đưa ${savedPhone.brand} ${savedPhone.model} về trạng thái trước sửa`);
      }
      setSyncMessage("Đã ghi điện thoại lên Supabase");
      setPhoneDraft(null);
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperations(partLockKeys);
      finishOperation(lockKey);
    }
  }

  async function savePart(part: Part, initialStatus?: "importing" | "imported") {
    const lockKey = `part:${part.id}`;
    if (!beginOperation(lockKey)) return;
    const existingPart = parts.find((item) => item.id === part.id);
    const isNewPart = !existingPart;
    const quantityDelta = Number(part.quantity || 0) - Number(existingPart?.quantity ?? 0);
    const importStatus = initialStatus ?? "imported"; // Mặc định là "imported" nếu không truyền vào
    const initialImport: PartImport | null =
      isNewPart && Number(part.quantity || 0) > 0
        ? {
            id: uid("partimport"),
            partId: part.id,
            quantity: Number(part.quantity || 0),
            unitCost: Number(part.purchaseCost || 0),
            importDateTime: new Date().toISOString(),
            supplier: part.supplier,
            notes: part.notes ? `Nhập ban đầu: ${part.notes}` : "Nhập kho ban đầu",
            status: importStatus
          }
        : null;
    const stockAdjustment: PartImport | null =
      !isNewPart && quantityDelta !== 0
        ? {
            id: uid("partimport"),
            partId: part.id,
            quantity: quantityDelta,
            unitCost: Number(part.purchaseCost || 0),
            importDateTime: new Date().toISOString(),
            supplier: part.supplier,
            notes:
              quantityDelta > 0
                ? `Điều chỉnh tăng tồn kho từ ${existingPart?.quantity ?? 0} lên ${part.quantity}`
                : `Điều chỉnh giảm tồn kho từ ${existingPart?.quantity ?? 0} xuống ${part.quantity}`,
            status: "imported"
          }
        : null;
    const historyEntry = initialImport ?? stockAdjustment;
    
    // Điều chỉnh part.quantity dựa trên trạng thái
    const finalPart = isNewPart && initialImport?.status === "importing" 
      ? { ...part, quantity: 0 } // Nếu đang nhập thì không cộng vào tồn kho
      : part;
    
    try {
      await remoteUpsert.part(finalPart);
      if (historyEntry) await remoteUpsert.partImport(historyEntry);
      setParts((current) => [...current.filter((item) => item.id !== finalPart.id), finalPart]);
      if (historyEntry) setPartImports((current) => [historyEntry, ...current]);
      await writeLog(isNewPart ? "create" : "update", "parts", finalPart.id, `${isNewPart ? "Tạo" : "Cập nhật"} linh kiện ${finalPart.name}`);
      setSyncMessage("Đã ghi linh kiện lên Supabase");
      setPartDraft(null);
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function savePartImport(part: Part, partImport: PartImport) {
    const lockKey = `part:${part.id}`;
    if (!beginOperation(lockKey)) return;
    const currentPart = parts.find((item) => item.id === part.id);
    if (!currentPart) {
      setSyncMessage("Linh kiện không còn tồn tại trong kho.");
      finishOperation(lockKey);
      return;
    }
    
    const previousImport = partImports.find((item) => item.id === partImport.id);
    const isUpdate = !!previousImport;
    
    if (isUpdate) {
      // Nếu là update, gọi hàm updatePartImport
      finishOperation(lockKey);
      await updatePartImport(part, partImport, previousImport);
      return;
    }
    
    const savedImport = {
      ...partImport,
      importDateTime: partImport.importDateTime ? new Date(partImport.importDateTime).toISOString() : new Date().toISOString()
    };
    const importedQuantity = Number(savedImport.quantity || 0);
    const importedCost = Number(savedImport.unitCost || 0);
    if (importedQuantity <= 0) {
      setSyncMessage("Số lượng nhập phải lớn hơn 0.");
      finishOperation(lockKey);
      return;
    }
    
    // Chỉ cộng số lượng vào kho khi trạng thái là "imported"
    const shouldUpdateStock = savedImport.status === "imported";
    const updatedPart = shouldUpdateStock
      ? {
          ...currentPart,
          quantity: currentPart.quantity + importedQuantity,
          purchaseCost: importedCost,
          supplier: savedImport.supplier || currentPart.supplier
        }
      : {
          ...currentPart,
          purchaseCost: importedCost,
          supplier: savedImport.supplier || currentPart.supplier
        };
    
    try {
      await remoteUpsert.partImport(savedImport);
      await remoteUpsert.part(updatedPart);
      setPartImports((current) => [savedImport, ...current.filter((item) => item.id !== savedImport.id)]);
      setParts((current) => current.map((item) => (item.id === updatedPart.id ? updatedPart : item)));
      await writeLog(
        "create",
        "part_imports",
        savedImport.id,
        `${shouldUpdateStock ? "Nhập" : "Tạo phiếu nhập"} ${savedImport.quantity} ${currentPart.name} ${shouldUpdateStock ? "vào kho" : "(chờ nhập)"}`
      );
      setSyncMessage(shouldUpdateStock ? "Đã nhập linh kiện vào kho" : "Đã tạo phiếu nhập, chưa cộng vào kho");
      setPartImportDraft(null);
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function deletePartImport(partImport: PartImport) {
    const part = parts.find((item) => item.id === partImport.partId);
    if (!part) return;
    
    // Chỉ trừ tồn kho nếu phiếu nhập đã có trạng thái "imported"
    const shouldUpdateStock = partImport.status === "imported";
    const confirmMessage = shouldUpdateStock
      ? `Xoá phiếu nhập ${part.name} số lượng ${partImport.quantity}? Tồn kho sẽ được trừ lại tương ứng.`
      : `Xoá phiếu nhập ${part.name} số lượng ${partImport.quantity}? (Phiếu này chưa nhập kho nên không ảnh hưởng tồn kho)`;
    
    if (!window.confirm(confirmMessage)) return;
    const lockKey = `part:${part.id}`;
    if (!beginOperation(lockKey)) return;
    const remainingImports = partImports
      .filter((item) => item.id !== partImport.id && item.partId === partImport.partId)
      .sort((a, b) => b.importDateTime.localeCompare(a.importDateTime));
    const updatedPart = shouldUpdateStock
      ? {
          ...part,
          quantity: Math.max(0, part.quantity - Number(partImport.quantity || 0)),
          purchaseCost: remainingImports[0]?.unitCost ?? part.purchaseCost,
          supplier: remainingImports[0]?.supplier || part.supplier
        }
      : part;
    try {
      await softDeleteRemoteRow("part_imports", partImport.id);
      if (shouldUpdateStock) await remoteUpsert.part(updatedPart);
      setPartImports((current) => current.filter((item) => item.id !== partImport.id));
      if (shouldUpdateStock) setParts((current) => current.map((item) => (item.id === updatedPart.id ? updatedPart : item)));
      await writeLog("delete", "part_imports", partImport.id, `Xoá phiếu nhập ${part.name}`);
      await refreshAuditState();
      setSyncMessage(shouldUpdateStock ? "Đã xoá phiếu nhập và trừ tồn kho" : "Đã xoá phiếu nhập (không ảnh hưởng tồn kho)");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function updatePartImport(part: Part, partImport: PartImport, previousImport: PartImport) {
    const lockKey = `part:${part.id}`;
    if (!beginOperation(lockKey)) return;
    const currentPart = parts.find((item) => item.id === part.id);
    if (!currentPart) {
      setSyncMessage("Linh kiện không còn tồn tại trong kho.");
      finishOperation(lockKey);
      return;
    }
    
    const savedImport = {
      ...partImport,
      importDateTime: partImport.importDateTime ? new Date(partImport.importDateTime).toISOString() : new Date().toISOString()
    };
    
    const importedQuantity = Number(savedImport.quantity || 0);
    const previousQuantity = Number(previousImport.quantity || 0);
    const importedCost = Number(savedImport.unitCost || 0);
    
    if (importedQuantity <= 0) {
      setSyncMessage("Số lượng nhập phải lớn hơn 0.");
      finishOperation(lockKey);
      return;
    }
    
    // Xác định xem trạng thái có thay đổi không
    const wasImported = previousImport.status === "imported";
    const isNowImported = savedImport.status === "imported";
    const statusChanged = wasImported !== isNowImported;
    const quantityChanged = importedQuantity !== previousQuantity;
    
    // Tính toán số lượng cần cộng/trừ trong kho
    let quantityDelta = 0;
    if (statusChanged) {
      if (isNowImported && !wasImported) {
        // Chuyển từ "đang nhập" sang "đã nhập" -> cộng số lượng vào kho
        quantityDelta = importedQuantity;
      } else if (!isNowImported && wasImported) {
        // Chuyển từ "đã nhập" sang "đang nhập" -> trừ số lượng khỏi kho
        quantityDelta = -previousQuantity;
      }
    } else if (isNowImported && quantityChanged) {
      // Cả hai đều "đã nhập" và số lượng thay đổi
      quantityDelta = importedQuantity - previousQuantity;
    }
    
    const updatedPart = {
      ...currentPart,
      quantity: Math.max(0, currentPart.quantity + quantityDelta),
      purchaseCost: importedCost,
      supplier: savedImport.supplier || currentPart.supplier
    };
    
    try {
      await remoteUpsert.partImport(savedImport);
      await remoteUpsert.part(updatedPart);
      setPartImports((current) => current.map((item) => (item.id === savedImport.id ? savedImport : item)));
      setParts((current) => current.map((item) => (item.id === updatedPart.id ? updatedPart : item)));
      await writeLog("update", "part_imports", savedImport.id, `Cập nhật phiếu nhập ${currentPart.name}`);
      setSyncMessage("Đã cập nhật phiếu nhập");
      setPartImportDraft(null);
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function togglePartImportStatus(partImport: PartImport) {
    const part = parts.find((item) => item.id === partImport.partId);
    if (!part) {
      setSyncMessage("Linh kiện không còn tồn tại trong kho.");
      return;
    }
    
    const newStatus: "importing" | "imported" = partImport.status === "imported" ? "importing" : "imported";
    const confirmMessage =
      newStatus === "imported"
        ? `Chuyển sang trạng thái "Đã nhập"? Hệ thống sẽ cộng ${partImport.quantity} ${part.name} vào kho.`
        : `Chuyển sang trạng thái "Đang nhập"? Hệ thống sẽ trừ ${partImport.quantity} ${part.name} khỏi kho.`;
    
    if (!window.confirm(confirmMessage)) return;
    
    const updatedImport = { ...partImport, status: newStatus };
    await updatePartImport(part, updatedImport, partImport);
  }

  async function deleteRepairPartFromPhone(repairPart: RepairPart) {
    const part = parts.find((item) => item.id === repairPart.partId);
    const confirmMessage = part
      ? `Xoá ${repairPart.quantity} ${part.name} khỏi mục sửa chữa? Hệ thống sẽ hoàn lại số lượng này vào kho.`
      : `Xoá linh kiện này khỏi mục sửa chữa? Không tìm thấy linh kiện trong kho nên hệ thống chỉ xoá chi phí sửa chữa.`;
    if (!window.confirm(confirmMessage)) return;

    const lockKeys = [`repair-part:${repairPart.id}`, ...(part ? [`part:${part.id}`] : [])];
    if (!beginOperations(lockKeys)) return;
    const updatedPart = part
      ? {
          ...part,
          quantity: part.quantity + Number(repairPart.quantity || 0)
        }
      : undefined;
    try {
      await softDeleteRemoteRow("repair_parts", repairPart.id);
      if (updatedPart) await remoteUpsert.part(updatedPart);
      setRepairParts((current) => current.filter((item) => item.id !== repairPart.id));
      if (updatedPart) {
        setParts((current) => current.map((item) => (item.id === updatedPart.id ? updatedPart : item)));
      }
      await writeLog("delete", "repair_parts", repairPart.id, `Xoá linh kiện sửa chữa ${part?.name ?? repairPart.partId}`);
      setSyncMessage(updatedPart ? "Đã xoá linh kiện sửa chữa và hoàn lại kho" : "Đã xoá linh kiện sửa chữa");
      await refreshAuditState();
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperations(lockKeys);
    }
  }

  async function deletePhone(phone: Phone) {
    const lockKey = `delete-phone:${phone.id}`;
    const phoneRepairs = repairs.filter((repair) => repair.phoneId === phone.id);
    const repairIds = phoneRepairs.map((repair) => repair.id);
    const phoneRepairParts = repairParts.filter((repairPart) => repairIds.includes(repairPart.repairId));
    const shouldReturnParts = !["Ready For Sale", "Reserved", "Sold"].includes(phone.status);
    const returnedQuantities = phoneRepairParts.reduce<Record<string, number>>((acc, repairPart) => {
      acc[repairPart.partId] = (acc[repairPart.partId] ?? 0) + repairPart.quantity;
      return acc;
    }, {});
    const returnedPartCount = Object.values(returnedQuantities).reduce((sum, quantity) => sum + quantity, 0);
    const confirmMessage = shouldReturnParts
      ? `Xoá ${phone.brand} ${phone.model}? Máy chưa sửa xong nên hệ thống sẽ hoàn lại ${returnedPartCount} linh kiện đã chọn vào kho. Dữ liệu lỗi, sửa chữa, chi phí và bán hàng liên quan cũng sẽ bị xoá.`
      : `Xoá ${phone.brand} ${phone.model}? Máy đã sửa xong/sẵn sàng bán hoặc đã bán nên hệ thống sẽ không hoàn lại linh kiện. Dữ liệu lỗi, sửa chữa, chi phí và bán hàng liên quan cũng sẽ bị xoá.`;
    if (!window.confirm(confirmMessage)) return;
    const partLockKeys = Object.keys(returnedQuantities).map((partId) => `part:${partId}`);
    if (!beginOperations([lockKey, ...partLockKeys])) return;
    const restoredParts = shouldReturnParts
      ? parts
          .filter((part) => returnedQuantities[part.id])
          .map((part) => ({
            ...part,
            quantity: part.quantity + returnedQuantities[part.id]
          }))
      : [];
    try {
      await Promise.all(restoredParts.map((part) => remoteUpsert.part(part)));
      await softDeleteRemoteWhere("sales", "phone_id", phone.id);
      await softDeleteRemoteWhere("expenses", "phone_id", phone.id);
      await softDeleteRemoteWhere("phone_faults", "phone_id", phone.id);
      await Promise.all(repairIds.map((repairId) => softDeleteRemoteWhere("repair_parts", "repair_id", repairId)));
      await softDeleteRemoteWhere("repairs", "phone_id", phone.id);
      await softDeleteRemoteRow("phones", phone.id);
      setPhones((current) => current.filter((item) => item.id !== phone.id));
      setFaults((current) => current.filter((fault) => fault.phoneId !== phone.id));
      setRepairs((current) => current.filter((repair) => repair.phoneId !== phone.id));
      setRepairParts((current) => current.filter((repairPart) => !repairIds.includes(repairPart.repairId)));
      if (restoredParts.length > 0) {
        setParts((current) => current.map((part) => restoredParts.find((restoredPart) => restoredPart.id === part.id) ?? part));
      }
      setExpenses((current) => current.filter((expense) => expense.phoneId !== phone.id));
      setSales((current) => current.filter((sale) => sale.phoneId !== phone.id));
      await writeLog("delete", "phones", phone.id, `Xoá điện thoại ${phone.brand} ${phone.model}`);
      await refreshAuditState();
      setSyncMessage(shouldReturnParts ? "Đã xoá điện thoại và hoàn lại linh kiện vào kho" : "Đã xoá điện thoại, không hoàn linh kiện vì máy đã sửa xong");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperations([lockKey, ...partLockKeys]);
    }
  }

  async function deletePart(part: Part) {
    if (!window.confirm(`Xoá linh kiện "${part.name}" khỏi kho? Lịch sử sửa chữa cũ vẫn giữ đơn giá đã dùng.`)) return;
    const lockKey = `part:${part.id}`;
    if (!beginOperation(lockKey)) return;
    try {
      await softDeleteRemoteRow("parts", part.id);
      await softDeleteRemoteWhere("part_imports", "part_id", part.id);
      setParts((current) => current.filter((item) => item.id !== part.id));
      setPartImports((current) => current.filter((item) => item.partId !== part.id));
      await writeLog("delete", "parts", part.id, `Xoá linh kiện ${part.name}`);
      await refreshAuditState();
      setSyncMessage("Đã xoá linh kiện trên Supabase");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function deleteSale(sale: Sale) {
    if (!window.confirm("Xoá giao dịch bán hàng này? Máy sẽ được chuyển lại về trạng thái sẵn sàng bán.")) return;
    const lockKey = `delete-sale:${sale.id}`;
    if (!beginOperation(lockKey)) return;
    try {
      const phone = phones.find((item) => item.id === sale.phoneId);
      const restoredPhone = phone ? { ...phone, status: "Ready For Sale" as const, updatedAt: new Date().toISOString() } : undefined;
      await softDeleteRemoteRow("sales", sale.id);
      if (restoredPhone) await remoteUpsert.phone(restoredPhone);
      setSales((current) => current.filter((item) => item.id !== sale.id));
      if (restoredPhone) setPhones((current) => current.map((item) => (item.id === restoredPhone.id ? restoredPhone : item)));
      await writeLog("delete", "sales", sale.id, "Xoá giao dịch bán hàng");
      await refreshAuditState();
      setSyncMessage("Đã xoá giao dịch trên Supabase");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function deleteCustomer(customerId: string) {
    if (!window.confirm("Xoá khách hàng này? Các giao dịch bán hàng vẫn được giữ lại nhưng sẽ hiển thị khách hàng là không rõ.")) return;
    const lockKey = `delete-customer:${customerId}`;
    if (!beginOperation(lockKey)) return;
    const customer = customers.find((item) => item.id === customerId);
    try {
      await softDeleteRemoteRow("customers", customerId);
      setCustomers((current) => current.filter((customer) => customer.id !== customerId));
      await writeLog("delete", "customers", customerId, `Xoá khách hàng ${customer?.name ?? customerId}`);
      await refreshAuditState();
      setSyncMessage("Đã xoá khách hàng trên Supabase");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function updateSettings(nextSettings: Settings) {
    const savedSettings = { ...nextSettings, currency: "VND" };
    setSettings(savedSettings);
    try {
      await remoteUpsert.settings(savedSettings);
      await writeLog("update", "settings", savedSettings.id, "Cập nhật cài đặt hệ thống");
      setSyncMessage("Đã ghi cài đặt lên Supabase");
    } catch (error) {
      reportSyncError(error);
    }
  }

  async function restoreDeletedRow(row: DeletedRow) {
    if (!window.confirm(`Khôi phục "${row.label}" từ thùng rác?`)) return;
    const lockKey = `restore:${row.table}:${row.id}`;
    if (!beginOperation(lockKey)) return;
    let restorePartLockKeys: string[] = [];
    try {
      if (row.table === "phones") {
        const relatedRows = deletedRows.filter((deletedRow) => {
          if (deletedRow.table === "phone_faults" || deletedRow.table === "repairs" || deletedRow.table === "expenses" || deletedRow.table === "sales") {
            return String(deletedRow.row.phone_id ?? "") === row.id;
          }
          if (deletedRow.table === "repair_parts") {
            return deletedRows.some(
              (repairRow) =>
                repairRow.table === "repairs" &&
                String(repairRow.row.phone_id ?? "") === row.id &&
                String(repairRow.row.id ?? "") === String(deletedRow.row.repair_id ?? "")
            );
          }
          return false;
        });
        const shouldTakePartsAgain = !["Ready For Sale", "Reserved", "Sold"].includes(String(row.row.status ?? ""));
        if (shouldTakePartsAgain) {
          const restoredQuantities = relatedRows
            .filter((relatedRow) => relatedRow.table === "repair_parts")
            .reduce<Record<string, number>>((acc, relatedRow) => {
              const partId = String(relatedRow.row.part_id ?? "");
              if (!partId) return acc;
              acc[partId] = (acc[partId] ?? 0) + Number(relatedRow.row.quantity ?? 0);
              return acc;
            }, {});
          restorePartLockKeys = Object.keys(restoredQuantities).map((partId) => `part:${partId}`);
          if (restorePartLockKeys.length > 0 && !beginOperations(restorePartLockKeys)) {
            restorePartLockKeys = [];
            return;
          }
          const updatedParts = parts
            .filter((part) => restoredQuantities[part.id])
            .map((part) => ({
              ...part,
              quantity: Math.max(0, part.quantity - restoredQuantities[part.id])
            }));
          await Promise.all(updatedParts.map((part) => remoteUpsert.part(part)));
        }
        await Promise.all(relatedRows.map((relatedRow) => restoreRemoteRow(relatedRow.table, relatedRow.id)));
      }
      if (row.table === "part_imports") {
        const part = parts.find((item) => item.id === String(row.row.part_id));
        const importStatus = String(row.row.status ?? "imported");
        // Chỉ cộng số lượng vào kho nếu trạng thái là "imported"
        const shouldUpdateStock = importStatus === "imported";
        
        if (part && shouldUpdateStock) {
          restorePartLockKeys = [`part:${part.id}`];
          if (!beginOperations(restorePartLockKeys)) {
            restorePartLockKeys = [];
            return;
          }
          await remoteUpsert.part({
            ...part,
            quantity: part.quantity + Number(row.row.quantity ?? 0),
            purchaseCost: Number(row.row.unit_cost ?? part.purchaseCost),
            supplier: row.row.supplier ? String(row.row.supplier) : part.supplier
          });
        }
      }
      await restoreRemoteRow(row.table, row.id);
      await writeLog("restore", row.table, row.id, `Khôi phục ${row.label}`);
      await loadRemoteState();
      setSyncMessage("Đã khôi phục dữ liệu từ thùng rác");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperations(restorePartLockKeys);
      finishOperation(lockKey);
    }
  }

  async function saveSale(input: {
    phoneId: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    salePrice: number;
    depositAmount: number;
    saleDate: string;
    saleDateTime: string;
    deliveryStatus: SaleDeliveryStatus;
    notes: string;
  }) {
    if (!input.phoneId) return false;
    const lockKey = `save-sale:${input.phoneId}`;
    if (!beginOperation(lockKey)) return false;
    const phone = phones.find((item) => item.id === input.phoneId);
    if (!phone || !["Ready For Sale", "Reserved"].includes(phone.status)) {
      setSyncMessage("Máy này không còn ở trạng thái có thể bán. Vui lòng tải lại dữ liệu hoặc chọn máy khác.");
      finishOperation(lockKey);
      return false;
    }
    const existingCustomer = customers.find(
      (customer) =>
        normalizeCustomerIdentity(customer.name) === normalizeCustomerIdentity(input.customerName) &&
        normalizeCustomerIdentity(customer.phone) === normalizeCustomerIdentity(input.customerPhone)
    );
    const customer: Customer = {
      id: existingCustomer?.id ?? uid("customer"),
      name: input.customerName,
      phone: input.customerPhone,
      address: input.customerAddress || existingCustomer?.address
    };
    const sale: Sale = {
      id: uid("sale"),
      phoneId: input.phoneId,
      customerId: customer.id,
      salePrice: Number(input.salePrice),
      depositAmount: Number(input.depositAmount),
      saleDate: input.saleDateTime.slice(0, 10) || input.saleDate,
      saleDateTime: input.saleDateTime ? new Date(input.saleDateTime).toISOString() : undefined,
      deliveryStatus: input.deliveryStatus,
      notes: input.notes
    };
    const nextPhoneStatus = input.deliveryStatus === "not_received" ? "Ready For Sale" : "Sold";
    const soldPhone = phone ? { ...phone, status: nextPhoneStatus as PhoneStatus, updatedAt: new Date().toISOString() } : undefined;
    try {
      await remoteUpsert.customer(customer);
      await remoteUpsert.sale(sale);
      if (soldPhone) await remoteUpsert.phone(soldPhone);
      setCustomers((current) => {
        const exists = current.some((item) => item.id === customer.id);
        return exists ? current.map((item) => (item.id === customer.id ? customer : item)) : [...current, customer];
      });
      setSales((current) => [...current, sale]);
      if (soldPhone) setPhones((current) => current.map((item) => (item.id === soldPhone.id ? soldPhone : item)));
      await writeLog("create", "sales", sale.id, `Tạo giao dịch bán hàng ${currency(sale.salePrice)}`);
      setSyncMessage("Đã ghi bán hàng lên Supabase");
      return true;
    } catch (error) {
      reportSyncError(error);
      return false;
    } finally {
      finishOperation(lockKey);
    }
  }

  async function updateSaleDeliveryStatus(sale: Sale, deliveryStatus: SaleDeliveryStatus) {
    const lockKey = `update-sale-status:${sale.id}`;
    if (!beginOperation(lockKey)) return;
    const updatedSale = { ...sale, deliveryStatus };
    const phone = phones.find((item) => item.id === sale.phoneId);
    const restoredPhone = phone
      ? {
          ...phone,
          status: (deliveryStatus === "not_received" ? "Ready For Sale" : "Sold") as PhoneStatus,
          updatedAt: new Date().toISOString()
        }
      : undefined;
    try {
      await remoteUpsert.sale(updatedSale);
      if (restoredPhone) await remoteUpsert.phone(restoredPhone);
      setSales((current) => current.map((item) => (item.id === sale.id ? updatedSale : item)));
      if (restoredPhone) setPhones((current) => current.map((item) => (item.id === restoredPhone.id ? restoredPhone : item)));
      await writeLog("update", "sales", sale.id, `Cập nhật trạng thái vận chuyển: ${deliveryStatusLabels[deliveryStatus]}`);
      setSyncMessage("Đã cập nhật trạng thái vận chuyển");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function updatePhoneStatus(phone: Phone, status: PhoneStatus, message: string) {
    const lockKey = `update-phone-status:${phone.id}`;
    if (!beginOperation(lockKey)) return;
    const updatedPhone = { ...phone, status, updatedAt: new Date().toISOString() };
    try {
      await remoteUpsert.phone(updatedPhone);
      setPhones((current) => current.map((item) => (item.id === updatedPhone.id ? updatedPhone : item)));
      await writeLog("update", "phones", phone.id, `${message}: ${phone.brand} ${phone.model}`);
      setSyncMessage(message);
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function updatePhoneAskingPrice(phone: Phone, askingPrice: number) {
    const lockKey = `phone-price:${phone.id}`;
    if (!beginOperation(lockKey)) return;
    const updatedPhone = { ...phone, askingPrice: Number(askingPrice || 0), updatedAt: new Date().toISOString() };
    try {
      await remoteUpsert.phone(updatedPhone);
      setPhones((current) => current.map((item) => (item.id === updatedPhone.id ? updatedPhone : item)));
      await writeLog("update", "phones", phone.id, `Cập nhật giá bán dự kiến ${phone.brand} ${phone.model}`);
      setSyncMessage("Đã cập nhật giá bán dự kiến");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
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
    if (repairSavingRef.current) return;
    repairSavingRef.current = true;
    setRepairSaving(true);
    let repairOperationKeys: string[] = [];
    const selectedQuantities = input.selectedParts.reduce<Record<string, number>>((acc, item) => {
      const quantity = Number(item.quantity || 0);
      if (quantity > 0) acc[item.part.id] = (acc[item.part.id] ?? 0) + quantity;
      return acc;
    }, {});
    const normalizedSelectedParts = Object.entries(selectedQuantities)
      .map(([partId, quantity]) => {
        const currentPart = parts.find((part) => part.id === partId);
        return currentPart ? { part: currentPart, quantity } : null;
      })
      .filter(Boolean) as { part: Part; quantity: number }[];
    repairOperationKeys = [`repair:${input.phone.id}`, ...normalizedSelectedParts.map(({ part }) => `part:${part.id}`)];
    if (!beginOperations(repairOperationKeys)) {
      repairSavingRef.current = false;
      setRepairSaving(false);
      return;
    }
    const invalidParts = normalizedSelectedParts.filter(({ part, quantity }) => part.quantity <= 0 || quantity > part.quantity);
    if (invalidParts.length > 0) {
      setSyncMessage(
        `Không đủ tồn kho: ${invalidParts
          .map(({ part, quantity }) => `${part.name} cần ${quantity}, còn ${part.quantity}`)
          .join("; ")}`
      );
      finishOperations(repairOperationKeys);
      repairSavingRef.current = false;
      setRepairSaving(false);
      return;
    }
    const updatedParts = normalizedSelectedParts.map(({ part, quantity }) => ({
      ...part,
      quantity: part.quantity - quantity
    }));
    const savedPhone = {
      ...input.phone,
      status: "Waiting Repair" as const,
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
    const replacements: RepairPart[] = normalizedSelectedParts.map(({ part, quantity }) => ({
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
      await writeLog("create", "repairs", savedRepair.id, `Lưu thay linh kiện cho ${input.phone.brand} ${input.phone.model}`);
      setSyncMessage("Đã ghi sửa chữa lên Supabase");
      setRepairPhone(null);
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperations(repairOperationKeys);
      repairSavingRef.current = false;
      setRepairSaving(false);
    }
  }

  function makeBackupPayload(): BackupPayload {
    return {
      phones,
      faults,
      repairs,
      parts,
      partImports,
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
    const lockKey = "restore-backup";
    if (!beginOperation(lockKey)) return;
    try {
      const payload = JSON.parse(await file.text()) as BackupPayload;
      await pushBackupToSupabase(payload);
      setPhones(payload.phones ?? []);
      setFaults(payload.faults ?? []);
      setRepairs(payload.repairs ?? []);
      setParts(payload.parts ?? []);
      setPartImports(payload.partImports ?? []);
      setRepairParts(payload.repairParts ?? []);
      setExpenses(payload.expenses ?? []);
      setCustomers(payload.customers ?? []);
      setSales(payload.sales ?? []);
      setSettings(payload.settings?.[0] ?? defaultSettings);
      setSyncMessage("Đã khôi phục và ghi dữ liệu lên Supabase");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
    }
  }

  async function handlePushLocalToSupabase() {
    const lockKey = "push-local-backup";
    if (!beginOperation(lockKey)) return;
    try {
      await pushBackupToSupabase(makeBackupPayload());
      setSyncMessage("Đã đẩy dữ liệu hiện tại lên Supabase");
    } catch (error) {
      reportSyncError(error);
    } finally {
      finishOperation(lockKey);
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
          {view === "intake" && (
            <PhoneIntakeView
              phones={phones.filter((phone) => phone.status === "Purchased")}
              settings={settings}
              onCreate={() => setPhoneDraft(blankPhone())}
              onEdit={setPhoneDraft}
              onReceive={(phone) => void updatePhoneStatus(phone, "Waiting Inspection", "Đã chuyển máy sang chờ kiểm tra")}
              onDelete={deletePhone}
            />
          )}
          {view === "phones" && (
            <PhonesView
              phones={filteredPhones.filter((phone) => repairWorkflowStatuses.includes(phone.status))}
              faults={faults}
              repairs={repairs}
              repairParts={repairParts}
              parts={parts}
              expenses={expenses}
              settings={settings}
              deletedRows={trashFor(["phones"])}
              onRepair={setRepairPhone}
              onRepairDone={(phone) => void updatePhoneStatus(phone, "Ready For Sale", "Đã chuyển máy sang sẵn sàng bán")}
              onRestoreDeleted={restoreDeletedRow}
              onDelete={deletePhone}
              onDeleteRepairPart={deleteRepairPartFromPhone}
            />
          )}
          {view === "ready" && (
            <ReadyForSaleView
              phones={phones.filter((phone) => phone.status === "Ready For Sale" || phone.status === "Reserved")}
              repairs={repairs}
              repairParts={repairParts}
              expenses={expenses}
              settings={settings}
              onSetPhonePrice={updatePhoneAskingPrice}
              onReturnToRepair={(phone) => void updatePhoneStatus(phone, "Waiting Repair", "Đã đưa máy về chờ sửa")}
              onSell={(phone, askingPrice) => {
                setSalePhoneId(phone.id);
                setSalePriceDraft(askingPrice);
                setView("sales");
              }}
            />
          )}
          {view === "parts" && (
            <PartsView
              parts={parts}
              partImports={partImports}
              deletedRows={trashFor(["parts"])}
              onEdit={setPartDraft}
              onImport={(part) => setPartImportDraft({ part, partImport: blankPartImport(part) })}
              onRestoreDeleted={restoreDeletedRow}
              onDelete={deletePart}
            />
          )}
          {view === "partImports" && (
            <PartImportsView
              parts={parts}
              partImports={partImports}
              deletedRows={trashFor(["part_imports"])}
              onRestoreDeleted={restoreDeletedRow}
              onDelete={deletePartImport}
              onEdit={(part, partImport) => setPartImportDraft({ part, partImport })}
              onToggleStatus={togglePartImportStatus}
            />
          )}
          {view === "sales" && (
            <SalesView
              phones={phones}
              customers={customers}
              sales={sales}
              settings={settings}
              repairs={repairs}
              repairParts={repairParts}
              expenses={expenses}
              deletedRows={trashFor(["sales"])}
              onDelete={deleteSale}
              onRestoreDeleted={restoreDeletedRow}
              onUpdateDeliveryStatus={updateSaleDeliveryStatus}
              preferredPhoneId={salePhoneId}
              preferredSalePrice={salePriceDraft}
              onSave={saveSale}
            />
          )}
          {view === "customers" && (
            <CustomersView
              customers={customers}
              sales={sales}
              phones={phones}
              deletedRows={trashFor(["customers"])}
              onRestoreDeleted={restoreDeletedRow}
              onDelete={deleteCustomer}
            />
          )}
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
            <SettingsView
              settings={settings}
              supabaseConfigured={Boolean(supabase)}
              appLogs={appLogs}
              onChange={updateSettings}
            />
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
      {partImportDraft && (
        <PartImportDialog
          part={partImportDraft.part}
          partImport={partImportDraft.partImport}
          onClose={() => setPartImportDraft(null)}
          onSave={savePartImport}
        />
      )}
      {repairPhone && (
        <RepairDialog
          phone={repairPhone}
          parts={parts}
          repairs={repairs}
          repairParts={repairParts}
          expenses={expenses}
          settings={settings}
          saving={repairSaving}
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
  const [detailView, setDetailView] = useState<"lowStock" | null>(null);
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
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-muted px-3 py-2 text-sm font-semibold">{lowStockParts.length}/{parts.length}</span>
            {lowStockParts.length > 9 && (
              <button 
                className="btn-secondary h-9"
                onClick={() => setDetailView("lowStock")}
              >
                Xem tất cả
              </button>
            )}
          </div>
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
      
      {/* Modal chi tiết linh kiện sắp hết */}
      {detailView === "lowStock" && (
        <Modal title="Tất cả linh kiện sắp hết" onClose={() => setDetailView(null)}>
          <div className="max-h-[70vh] space-y-2 overflow-auto">
            {lowStockParts.map((part) => (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3" key={part.id}>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase text-slate-500">{part.brand || "Không rõ"}</p>
                  <p className="font-semibold">{part.name}</p>
                  <p className="text-sm text-slate-500">{part.category}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="rounded-md bg-red-100 px-2 py-1 text-sm font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-200">
                    {part.quantity}/{part.minimumStock}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{currency(part.purchaseCost)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn-secondary" onClick={() => setDetailView(null)}>
              Đóng
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PhoneIntakeView({
  phones,
  settings,
  onCreate,
  onEdit,
  onReceive,
  onDelete
}: {
  phones: Phone[];
  settings: Settings;
  onCreate: () => void;
  onEdit: (phone: Phone) => void;
  onReceive: (phone: Phone) => void;
  onDelete: (phone: Phone) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filteredPhones = phones
    .filter((phone) => {
      const text = [phone.brand, phone.model, phone.sellerName, phone.sellerPhone, phone.imei1, phone.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));
  const paginatedPhones = paginate(filteredPhones, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Nhập điện thoại</h2>
          <p className="text-sm text-slate-500">{filteredPhones.length}/{phones.length} máy đang chờ nhận</p>
        </div>
        <button className="btn-primary" onClick={onCreate}>
          <PackagePlus size={18} />
          Thêm máy nhập
        </button>
      </div>

      <div className="card p-4">
        <input
          className="field"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Tìm hãng, model, người mua, số điện thoại, IMEI, ghi chú"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="space-y-3 p-3 md:hidden">
          {paginatedPhones.items.map((phone) => (
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
                  <p className="mt-1 text-xs text-slate-500">Ngày nhập: {formatDateTimeText(phone.purchaseDate)}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Stat label="Giá nhập" value={currency(phone.purchasePrice, settings.currency)} />
                <Stat label="Tiền cọc" value={currency(phone.purchaseDeposit ?? 0, settings.currency)} />
                <Stat label="Vận chuyển" value={currency(phone.shippingFee ?? 0, settings.currency)} />
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <button className="btn-secondary w-full" onClick={() => onReceive(phone)}>
                  Đã nhận
                </button>
                <ActionMenu
                  label={`Thao tác nhập ${phone.brand} ${phone.model}`}
                  items={[
                    { label: "Sửa thông tin nhập", icon: <Pencil size={16} />, onClick: () => onEdit(phone) },
                    { label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(phone) }
                  ]}
                />
              </div>
            </div>
          ))}
          {paginatedPhones.items.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Chưa có máy đang chờ nhận</div>}
        </div>

        <div className="hidden overflow-auto md:block">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {["Ảnh", "Điện thoại", "Người mua", "Ngày nhập", "Giá nhập", "Tiền cọc", "Vận chuyển", "Trạng thái", ""].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedPhones.items.map((phone) => (
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
                    {phone.imei1 && <div className="text-xs text-slate-500">IMEI: {phone.imei1}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div>{phone.sellerName || "-"}</div>
                    {phone.sellerPhone && <div className="text-xs text-slate-500">{phone.sellerPhone}</div>}
                  </td>
                  <td className="px-4 py-3">{formatDateTimeText(phone.purchaseDate)}</td>
                  <td className="px-4 py-3">{currency(phone.purchasePrice, settings.currency)}</td>
                  <td className="px-4 py-3">{currency(phone.purchaseDeposit ?? 0, settings.currency)}</td>
                  <td className="px-4 py-3">{currency(phone.shippingFee ?? 0, settings.currency)}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={phone.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary" onClick={() => onReceive(phone)}>
                        Đã nhận
                      </button>
                      <ActionMenu
                        label={`Thao tác nhập ${phone.brand} ${phone.model}`}
                        items={[
                          { label: "Sửa thông tin nhập", icon: <Pencil size={16} />, onClick: () => onEdit(phone) },
                          { label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(phone) }
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedPhones.items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={9}>
                    Chưa có máy đang chờ nhận
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

function PhonesView(props: {
  phones: Phone[];
  faults: { phoneId: string; faultName: string }[];
  repairs: Repair[];
  repairParts: RepairPart[];
  parts: Part[];
  expenses: Expense[];
  settings: Settings;
  deletedRows: DeletedRow[];
  onRepair: (phone: Phone) => void;
  onRepairDone: (phone: Phone) => void;
  onRestoreDeleted: (row: DeletedRow) => void;
  onDelete: (phone: Phone) => void;
  onDeleteRepairPart: (repairPart: RepairPart) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [repairFilter, setRepairFilter] = useState("all");
  const [detailPhone, setDetailPhone] = useState<Phone | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const brands = uniqueValues(props.phones.map((phone) => phone.brand));
  const models = uniqueValues(
    props.phones
      .filter((phone) => brandFilter === "all" || phone.brand === brandFilter)
      .map((phone) => phone.model)
  );
  const filteredPhones = props.phones
    .filter((phone) => {
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
    })
    .sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate)); // Sắp xếp theo ngày mua mới nhất
  const paginatedPhones = paginate(filteredPhones, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, brandFilter, modelFilter, statusFilter, repairFilter, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Kiểm tra & sửa chữa</h2>
          <p className="text-sm text-slate-500">{filteredPhones.length}/{props.phones.length} máy trong luồng kiểm tra/sửa chữa</p>
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
            {repairWorkflowStatuses.map((status) => (
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
                  <Stat label="Tiền cọc" value={currency(phone.purchaseDeposit ?? 0, props.settings.currency)} />
                  <Stat label="Vận chuyển" value={currency(phone.shippingFee ?? 0, props.settings.currency)} />
                  <Stat label="Chi phí thay" value={currency(replacementCost, props.settings.currency)} />
                  <Stat label="Tổng vốn" value={currency(totalCost, props.settings.currency)} />
                </div>
                <div className="mt-3 grid gap-2">
                  {phone.status === "Waiting Inspection" && (
                    <button className="btn-secondary w-full" onClick={() => props.onRepair(phone)}>
                      <Wrench size={16} />
                      Thay linh kiện
                    </button>
                  )}
                  {(phone.status === "Waiting Repair" || phone.status === "Repairing") && (
                    <button className="btn-secondary w-full" onClick={() => props.onRepairDone(phone)}>
                      Sửa xong
                    </button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn-secondary w-full" onClick={() => setDetailPhone(phone)}>
                      <Eye size={16} />
                      Chi tiết
                    </button>
                    <ActionMenu
                      label={`Thao tác ${phone.brand} ${phone.model}`}
                      align="full"
                      items={[
                        { label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => props.onDelete(phone) }
                      ]}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {paginatedPhones.items.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Không có điện thoại phù hợp bộ lọc</div>}
        </div>
        <div className="hidden overflow-auto md:block">
        <table className="w-full min-w-[1220px] text-sm">
          <thead className="bg-muted text-left">
            <tr>
              {["Ảnh", "Điện thoại", "Tình trạng", "Lỗi", "Giá nhập", "Tiền cọc", "Vận chuyển", "Chi phí thay", "Tổng vốn", ""].map((header) => (
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
                  <td className="px-4 py-3">{currency(phone.purchaseDeposit ?? 0, props.settings.currency)}</td>
                  <td className="px-4 py-3">{currency(phone.shippingFee ?? 0, props.settings.currency)}</td>
                  <td className="px-4 py-3">{currency(replacementCost, props.settings.currency)}</td>
                  <td className="px-4 py-3 font-semibold">{currency(totalCost, props.settings.currency)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {phone.status === "Waiting Inspection" && (
                        <button className="btn-secondary" onClick={() => props.onRepair(phone)}>
                          <Wrench size={16} />
                          Thay linh kiện
                        </button>
                      )}
                      {(phone.status === "Waiting Repair" || phone.status === "Repairing") && (
                        <button className="btn-secondary" onClick={() => props.onRepairDone(phone)}>
                          Sửa xong
                        </button>
                      )}
                      <button className="btn-secondary" onClick={() => setDetailPhone(phone)}>
                        <Eye size={16} />
                        Chi tiết
                      </button>
                      <ActionMenu
                        label={`Thao tác ${phone.brand} ${phone.model}`}
                        items={[
                          { label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => props.onDelete(phone) }
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {paginatedPhones.items.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
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
      <TrashSection title="Thùng rác điện thoại" rows={props.deletedRows} onRestore={props.onRestoreDeleted} />
      {detailPhone && (
        <PhoneDetailModal
          phone={detailPhone}
          faults={props.faults.filter((fault) => fault.phoneId === detailPhone.id)}
          repairs={props.repairs.filter((repair) => repair.phoneId === detailPhone.id)}
          repairParts={props.repairParts}
          parts={props.parts}
          expenses={props.expenses.filter((expense) => expense.phoneId === detailPhone.id)}
          settings={props.settings}
          onAddRepair={() => {
            setDetailPhone(null);
            props.onRepair(detailPhone);
          }}
          onDeleteRepairPart={props.onDeleteRepairPart}
          onClose={() => setDetailPhone(null)}
        />
      )}
    </div>
  );
}

function PhoneDetailModal({
  phone,
  faults,
  repairs,
  repairParts,
  parts,
  expenses,
  settings,
  onAddRepair,
  onDeleteRepairPart,
  onClose
}: {
  phone: Phone;
  faults: { faultName: string }[];
  repairs: Repair[];
  repairParts: RepairPart[];
  parts: Part[];
  expenses: Expense[];
  settings: Settings;
  onAddRepair: () => void;
  onDeleteRepairPart: (repairPart: RepairPart) => void;
  onClose: () => void;
}) {
  const repairIds = new Set(repairs.map((repair) => repair.id));
  const usedParts = repairParts.filter((repairPart) => repairIds.has(repairPart.repairId));
  const partCost = usedParts.reduce((sum, repairPart) => sum + repairPart.quantity * repairPart.unitCost, 0);
  const laborCost = repairs.reduce((sum, repair) => sum + repair.laborCost, 0);
  const extraCost = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const replacementCost = partCost + laborCost + extraCost;
  const totalCost = phoneCost(phone, repairs, repairParts, expenses);
  const images = [
    ["Mặt trước", phone.imageFront],
    ["Mặt sau", phone.imageBack],
    ["IMEI", phone.imageImei],
    ["Phụ kiện", phone.imageAccessories]
  ].filter(([, src]) => src);

  return (
    <Modal title={`Chi tiết ${phone.brand} ${phone.model}`} onClose={onClose}>
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {images.map(([label, src]) => (
              <figure className="overflow-hidden rounded-lg border bg-background" key={label}>
                <img className="h-48 w-full object-cover" src={src} alt={`${phone.brand} ${phone.model} ${label}`} />
                <figcaption className="px-3 py-2 text-sm font-medium">{label}</figcaption>
              </figure>
            ))}
            {images.length === 0 && (
              <div className="flex h-48 items-center justify-center rounded-lg border bg-muted text-slate-400 sm:col-span-2">
                <Smartphone size={36} />
              </div>
            )}
          </div>
          <div className="card p-4">
            <h3 className="font-semibold">Tổng chi phí</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Stat label="Giá nhập" value={currency(phone.purchasePrice, settings.currency)} />
              <Stat label="Tiền cọc" value={currency(phone.purchaseDeposit ?? 0, settings.currency)} />
              <Stat label="Vận chuyển" value={currency(phone.shippingFee ?? 0, settings.currency)} />
              <Stat label="Linh kiện" value={currency(partCost, settings.currency)} />
              <Stat label="Công sửa" value={currency(laborCost, settings.currency)} />
              <Stat label="Chi phí khác" value={currency(extraCost, settings.currency)} />
              <Stat label="Tổng thay thế" value={currency(replacementCost, settings.currency)} />
              <Stat label="Tổng vốn" value={currency(totalCost, settings.currency)} warn />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {phone.brand} {phone.model}
                </h3>
                <p className="text-sm text-slate-500">{[phone.color, phone.storage, phone.ram, phone.carrier].filter(Boolean).join(" - ") || "Chưa có cấu hình chi tiết"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={phone.status} />
                {phone.status !== "Sold" && (
                  <button className="btn-secondary" type="button" onClick={onAddRepair}>
                    <Wrench size={16} />
                    Thêm linh kiện
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <DetailItem label="Người mua" value={phone.sellerName || "Chưa có"} />
              <DetailItem label="SĐT người mua" value={phone.sellerPhone || "Chưa có"} />
              <DetailItem label="Ngày nhập" value={phone.purchaseDate ? formatDateTimeText(phone.purchaseDate) : "Chưa có"} />
              <DetailItem label="IMEI 1" value={phone.imei1 || "Chưa có"} />
              <DetailItem label="IMEI 2" value={phone.imei2 || "Chưa có"} />
              <DetailItem label="Phụ kiện" value={phone.accessories || "Chưa có"} />
            </div>
            {phone.notes && <p className="mt-3 rounded-md bg-muted p-3 text-sm">{phone.notes}</p>}
          </div>

          <div className="card p-4">
            <h3 className="font-semibold">Tình trạng và sửa chữa</h3>
            <div className="mt-3 space-y-3">
              <div>
                <p className="label">Lỗi ghi nhận</p>
                <p className="text-sm">{faults.map((fault) => fault.faultName).join(", ") || "Không có"}</p>
              </div>
              <div>
                <p className="label">Linh kiện đã chọn</p>
                <div className="mt-2 max-h-56 space-y-2 overflow-auto pr-1">
                  {usedParts.map((repairPart) => {
                    const part = parts.find((item) => item.id === repairPart.partId);
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3" key={repairPart.id}>
                        <div>
                          <p className="font-medium">{part?.name ?? "Linh kiện không rõ"}</p>
                          <p className="text-xs text-slate-500">{part?.brand || "Không rõ hãng"} - SL {repairPart.quantity}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{currency(repairPart.quantity * repairPart.unitCost, settings.currency)}</span>
                          <button
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            type="button"
                            aria-label={`Xoá ${part?.name ?? "linh kiện"} khỏi sửa chữa`}
                            onClick={() => onDeleteRepairPart(repairPart)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {usedParts.length === 0 && <div className="py-3 text-sm text-slate-500">Chưa thay linh kiện.</div>}
                </div>
              </div>
              <div>
                <p className="label">Lịch sửa chữa</p>
                <div className="mt-2 space-y-2">
                  {repairs.map((repair) => (
                    <div className="rounded-md border bg-background p-3" key={repair.id}>
                      <div className="flex flex-wrap justify-between gap-2">
                        <p className="font-medium">{repair.description || "Sửa chữa"}</p>
                        <span className="text-sm font-semibold">{currency(repair.laborCost, settings.currency)}</span>
                      </div>
                      <p className="text-xs text-slate-500">{formatDateTimeText(repair.repairDate)}{repair.technician ? ` - ${repair.technician}` : ""}</p>
                      {repair.notes && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{repair.notes}</p>}
                    </div>
                  ))}
                  {repairs.length === 0 && <div className="py-3 text-sm text-slate-500">Chưa có lịch sửa chữa.</div>}
                </div>
              </div>
              <div>
                <p className="label">Chi phí khác</p>
                <div className="mt-2 space-y-2">
                  {expenses.map((expense) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3" key={expense.id}>
                      <div>
                        <p className="font-medium">{expense.category}</p>
                        <p className="text-xs text-slate-500">{expense.description || formatDateTimeText(expense.date)}</p>
                      </div>
                      <span className="text-sm font-semibold">{currency(expense.amount, settings.currency)}</span>
                    </div>
                  ))}
                  {expenses.length === 0 && <div className="py-3 text-sm text-slate-500">Không có chi phí khác.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="label">{label}</p>
      <p className="break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function PartsView({
  parts,
  partImports,
  deletedRows,
  onEdit,
  onImport,
  onRestoreDeleted,
  onDelete
}: {
  parts: Part[];
  partImports: PartImport[];
  deletedRows: DeletedRow[];
  onEdit: (part: Part) => void;
  onImport: (part: Part) => void;
  onRestoreDeleted: (row: DeletedRow) => void;
  onDelete: (part: Part) => void;
}) {
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
  const inventoryValue = filteredParts.reduce((sum, part) => sum + part.quantity * part.purchaseCost, 0);
  const importsByPart = new Map<string, PartImport[]>();
  for (const partImport of partImports) {
    const current = importsByPart.get(partImport.partId) ?? [];
    current.push(partImport);
    importsByPart.set(partImport.partId, current);
  }
  for (const imports of importsByPart.values()) {
    imports.sort((a, b) => b.importDateTime.localeCompare(a.importDateTime));
  }

  useEffect(() => {
    setPage(1);
  }, [searchTerm, brandFilter, categoryFilter, stockFilter, pageSize]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Kho linh kiện</h2>
          <p className="text-sm text-slate-500">
            {filteredParts.length}/{parts.length} linh kiện - Giá trị tồn {currency(inventoryValue)}
          </p>
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
          {paginatedParts.items.map((part) => {
            const imports = importsByPart.get(part.id) ?? [];
            return (
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
                <p>Giá nhập mới nhất: {currency(part.purchaseCost)}</p>
                  <p>Tối thiểu: {part.minimumStock}</p>
                  {part.supplier && <p>Nhà cung cấp: {part.supplier}</p>}
                </div>
                <details className="mt-3 rounded-md bg-muted p-2 text-sm">
                  <summary className="cursor-pointer font-semibold">Lịch sử nhập ({imports.length})</summary>
                  <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                    {imports.slice(0, 3).map((partImport) => (
                      <p key={partImport.id}>
                        {formatDateTimeText(partImport.importDateTime)} - {partImport.quantity} cái - {currency(partImport.unitCost)}
                      </p>
                    ))}
                    {imports.length === 0 && <p>Chưa có lịch sử nhập.</p>}
                  </div>
                </details>
                <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                  <button className="btn-secondary w-full" onClick={() => onImport(part)}>
                    Nhập
                  </button>
                  <ActionMenu
                    label={`Thao tác ${part.name}`}
                    items={[
                      { label: "Sửa", icon: <Pencil size={16} />, onClick: () => onEdit(part) },
                      { label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(part) }
                    ]}
                  />
                </div>
              </div>
            );
          })}
          {paginatedParts.items.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Không có linh kiện phù hợp bộ lọc</div>}
        </div>
        <div className="hidden max-h-[68vh] overflow-auto md:block">
          <table className="w-full min-w-[1160px] text-sm">
            <thead className="sticky top-0 z-10 bg-muted text-left">
              <tr>
                {["Hãng", "Linh kiện", "Danh mục", "Model tương thích", "Tồn", "Tối thiểu", "Giá nhập mới nhất", "Lịch sử nhập", "Nhà cung cấp", ""].map(
                  (header) => (
                    <th className="px-4 py-3 font-semibold" key={header}>
                      {header}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {paginatedParts.items.map((part) => {
                const imports = importsByPart.get(part.id) ?? [];
                const latestImport = imports[0];
                return (
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
                    <td className="px-4 py-3">
                      <details>
                        <summary className="cursor-pointer font-medium">
                          {latestImport ? `${latestImport.quantity} cái - ${currency(latestImport.unitCost)}` : "Chưa có"}
                        </summary>
                        <div className="mt-2 space-y-1 text-xs text-slate-500">
                          {imports.slice(0, 5).map((partImport) => (
                            <p key={partImport.id}>
                              {formatDateTimeText(partImport.importDateTime)} - {partImport.quantity} cái - {currency(partImport.unitCost)}
                            </p>
                          ))}
                          {imports.length === 0 && <p>Chưa có lịch sử nhập.</p>}
                        </div>
                      </details>
                    </td>
                    <td className="px-4 py-3">{part.supplier || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary h-9" onClick={() => onImport(part)}>
                          Nhập hàng
                        </button>
                        <ActionMenu
                          label={`Thao tác ${part.name}`}
                          items={[
                            { label: "Sửa", icon: <Pencil size={16} />, onClick: () => onEdit(part) },
                            { label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(part) }
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedParts.items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
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
      <TrashSection title="Thùng rác linh kiện" rows={deletedRows} onRestore={onRestoreDeleted} />
    </div>
  );
}

function PartImportsView({
  parts,
  partImports,
  deletedRows,
  onRestoreDeleted,
  onDelete,
  onEdit,
  onToggleStatus
}: {
  parts: Part[];
  partImports: PartImport[];
  deletedRows: DeletedRow[];
  onRestoreDeleted: (row: DeletedRow) => void;
  onDelete: (partImport: PartImport) => void;
  onEdit: (part: Part, partImport: PartImport) => void;
  onToggleStatus: (partImport: PartImport) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "importing" | "imported">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const brands = uniqueValues(parts.map((part) => part.brand));
  const categories = uniqueValues(parts.map((part) => part.category));
  const rows = partImports
    .map((partImport) => ({ partImport, part: parts.find((part) => part.id === partImport.partId) }))
    .sort((a, b) => b.partImport.importDateTime.localeCompare(a.partImport.importDateTime));
  const filteredRows = rows.filter(({ partImport, part }) => {
    const text = [
      part?.brand,
      part?.name,
      part?.category,
      part?.compatibleModels,
      partImport.supplier,
      partImport.notes,
      formatDateTimeText(partImport.importDateTime)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = text.includes(searchTerm.toLowerCase());
    const matchesBrand = brandFilter === "all" || part?.brand === brandFilter;
    const matchesCategory = categoryFilter === "all" || part?.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || partImport.status === statusFilter;
    return matchesSearch && matchesBrand && matchesCategory && matchesStatus;
  });
  const paginatedRows = paginate(filteredRows, page, pageSize);
  const totalQuantity = filteredRows.reduce((sum, row) => sum + row.partImport.quantity, 0);
  const totalValue = filteredRows.reduce((sum, row) => sum + row.partImport.quantity * row.partImport.unitCost, 0);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, brandFilter, categoryFilter, statusFilter, pageSize]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lịch sử nhập linh kiện</h2>
        <p className="text-sm text-slate-500">
          {filteredRows.length}/{partImports.length} phiếu - {totalQuantity} linh kiện - Tổng tiền {currency(totalValue)}
        </p>
      </div>

      <div className="card p-4">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <input
            className="field"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Tìm linh kiện, hãng, danh mục, nhà cung cấp, ghi chú"
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
          <select className="field" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "importing" | "imported")}>
            <option value="all">Tất cả trạng thái</option>
            <option value="importing">Đang nhập</option>
            <option value="imported">Đã nhập</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="space-y-3 p-3 md:hidden">
          {paginatedRows.items.map(({ partImport, part }) => (
            <div className="rounded-lg border bg-background p-3" key={partImport.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-slate-500">{formatDateTimeText(partImport.importDateTime)}</p>
                  <h3 className="truncate font-semibold">{part ? `${part.brand ? `${part.brand} - ` : ""}${part.name}` : "Linh kiện đã xoá"}</h3>
                  <p className="text-sm text-slate-500">{part?.category ?? "-"}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{partImport.quantity} cái</p>
                  <p className="text-xs text-slate-500">{currency(partImport.unitCost)}</p>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <p>Tổng tiền: {currency(partImport.quantity * partImport.unitCost)}</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm">Trạng thái:</span>
                  <button
                    onClick={() => onToggleStatus(partImport)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors hover:opacity-80",
                      partImport.status === "imported"
                        ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                        : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                    )}
                    title="Click để thay đổi trạng thái"
                  >
                    {partImport.status === "imported" ? "Đã nhập ✓" : "Đang nhập →"}
                  </button>
                </div>
                <p>Nhà cung cấp: {partImport.supplier || "-"}</p>
                {partImport.notes && <p className="line-clamp-2">Ghi chú: {partImport.notes}</p>}
              </div>
              <div className="mt-3 flex justify-end">
                <ActionMenu
                  label="Thao tác phiếu nhập"
                  items={[
                    { label: "Sửa", icon: <Pencil size={16} />, onClick: () => part && onEdit(part, partImport) },
                    { label: "Xoá phiếu nhập", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(partImport) }
                  ]}
                />
              </div>
            </div>
          ))}
          {paginatedRows.items.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Chưa có phiếu nhập phù hợp bộ lọc</div>}
        </div>

        <div className="hidden overflow-auto md:block">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {["Ngày giờ nhập", "Hãng", "Linh kiện", "Danh mục", "Số lượng", "Đơn giá", "Tổng tiền", "Trạng thái", "Nhà cung cấp", "Ghi chú", ""].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.items.map(({ partImport, part }) => (
                <tr className="border-t" key={partImport.id}>
                  <td className="px-4 py-3">{formatDateTimeText(partImport.importDateTime)}</td>
                  <td className="px-4 py-3">{part?.brand || "-"}</td>
                  <td className="px-4 py-3 font-medium">{part?.name ?? "Linh kiện đã xoá"}</td>
                  <td className="px-4 py-3">{part?.category ?? "-"}</td>
                  <td className="px-4 py-3 font-semibold">{partImport.quantity}</td>
                  <td className="px-4 py-3">{currency(partImport.unitCost)}</td>
                  <td className="px-4 py-3">{currency(partImport.quantity * partImport.unitCost)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onToggleStatus(partImport)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors hover:opacity-80",
                        partImport.status === "imported"
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300"
                      )}
                      title="Click để thay đổi trạng thái"
                    >
                      {partImport.status === "imported" ? "Đã nhập ✓" : "Đang nhập →"}
                    </button>
                  </td>
                  <td className="px-4 py-3">{partImport.supplier || "-"}</td>
                  <td className="px-4 py-3">{partImport.notes || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <ActionMenu
                      label="Thao tác phiếu nhập"
                      items={[
                        { label: "Sửa", icon: <Pencil size={16} />, onClick: () => part && onEdit(part, partImport) },
                        { label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(partImport) }
                      ]}
                    />
                  </td>
                </tr>
              ))}
              {paginatedRows.items.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={11}>
                    Chưa có phiếu nhập phù hợp bộ lọc
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={paginatedRows.page}
          totalPages={paginatedRows.totalPages}
          pageSize={pageSize}
          totalItems={filteredRows.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
      <TrashSection title="Thùng rác lịch sử nhập" rows={deletedRows} onRestore={onRestoreDeleted} />
    </div>
  );
}

function ReadyForSaleView({
  phones,
  repairs,
  repairParts,
  expenses,
  settings,
  onSetPhonePrice,
  onReturnToRepair,
  onSell
}: {
  phones: Phone[];
  repairs: Repair[];
  repairParts: RepairPart[];
  expenses: Expense[];
  settings: Settings;
  onSetPhonePrice: (phone: Phone, askingPrice: number) => void;
  onReturnToRepair: (phone: Phone) => void;
  onSell: (phone: Phone, askingPrice: number) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [priceDrafts, setPriceDrafts] = useState<Record<string, number>>({});
  const filteredPhones = phones
    .filter((phone) => {
      const text = [phone.brand, phone.model, phone.imei1, phone.sellerName, phone.notes, statusLabels[phone.status]]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(searchTerm.toLowerCase());
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sẵn sàng bán</h2>
          <p className="text-sm text-slate-500">{filteredPhones.length}/{phones.length} máy có thể bán</p>
        </div>
      </div>

      <div className="card p-4">
        <input
          className="field"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Tìm máy, IMEI, người nhập, trạng thái"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredPhones.map((phone) => {
          const cost = phoneCost(phone, repairs, repairParts, expenses);
          const priceValue = priceDrafts[phone.id] ?? phone.askingPrice ?? 0;
          const expectedProfit = priceValue - cost;
          return (
            <div className="card p-4" key={phone.id}>
              <div className="flex gap-3">
                {phone.imageFront ? (
                  <img className="h-20 w-20 shrink-0 rounded-md object-cover" src={phone.imageFront} alt={`${phone.brand} ${phone.model}`} />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-muted text-slate-400">
                    <Smartphone size={24} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        {phone.brand} {phone.model}
                      </h3>
                      {phone.imei1 && <p className="truncate text-xs text-slate-500">IMEI: {phone.imei1}</p>}
                    </div>
                    <StatusPill status={phone.status} />
                  </div>
                  {phone.notes && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{phone.notes}</p>}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <Stat label="Tổng vốn" value={currency(cost, settings.currency)} />
                <Stat label="Lãi dự kiến" value={currency(expectedProfit, settings.currency)} warn={expectedProfit < 0} />
              </div>

              <div className="mt-3 grid gap-2">
                <MoneyInput
                  placeholder="Giá bán dự kiến"
                  value={priceValue}
                  onChange={(askingPrice) => setPriceDrafts((current) => ({ ...current, [phone.id]: askingPrice }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn-secondary w-full" type="button" onClick={() => onSetPhonePrice(phone, priceValue)}>
                    Lưu giá
                  </button>
                  <button className="btn-primary w-full" type="button" onClick={() => onSell(phone, priceValue)}>
                    Bán hàng
                  </button>
                </div>
                <button className="btn-secondary w-full text-amber-700 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30" type="button" onClick={() => onReturnToRepair(phone)}>
                  Đưa về chờ sửa
                </button>
              </div>
            </div>
          );
        })}
        {filteredPhones.length === 0 && <div className="py-8 text-center text-sm text-slate-500 md:col-span-2 xl:col-span-3">Chưa có máy sẵn sàng bán.</div>}
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
  deletedRows,
  onDelete,
  onRestoreDeleted,
  onUpdateDeliveryStatus,
  preferredPhoneId,
  preferredSalePrice,
  onSave
}: {
  phones: Phone[];
  customers: Customer[];
  sales: Sale[];
  settings: Settings;
  repairs: Repair[];
  repairParts: RepairPart[];
  expenses: Expense[];
  deletedRows: DeletedRow[];
  onDelete: (sale: Sale) => void;
  onRestoreDeleted: (row: DeletedRow) => void;
  onUpdateDeliveryStatus: (sale: Sale, status: SaleDeliveryStatus) => void;
  preferredPhoneId?: string;
  preferredSalePrice?: number;
  onSave: (input: {
    phoneId: string;
    customerName: string;
    customerPhone: string;
    customerAddress: string;
    salePrice: number;
    depositAmount: number;
    saleDate: string;
    saleDateTime: string;
    deliveryStatus: SaleDeliveryStatus;
    notes: string;
  }) => Promise<boolean | void> | boolean | void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<"all" | SaleDeliveryStatus>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");
  
  const sellablePhones = phones.filter((phone) => phone.status === "Ready For Sale" || phone.status === "Reserved");
  
  // Filter sales
  const filteredSales = sales.filter((sale) => {
    const phone = phones.find((p) => p.id === sale.phoneId);
    const customer = customers.find((c) => c.id === sale.customerId);
    
    // Search filter
    const text = [
      phone?.brand,
      phone?.model,
      phone?.imei1,
      customer?.name,
      customer?.phone,
      customer?.address,
      sale.notes,
      formatSaleDateTime(sale)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesSearch = text.includes(searchTerm.toLowerCase());
    
    // Delivery status filter
    const matchesStatus = deliveryStatusFilter === "all" || sale.deliveryStatus === deliveryStatusFilter;
    
    // Date filter
    let matchesDate = true;
    if (dateFilter !== "all") {
      const saleDate = new Date(sale.saleDateTime || sale.saleDate);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      if (dateFilter === "today") {
        matchesDate = saleDate >= today;
      } else if (dateFilter === "week") {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        matchesDate = saleDate >= weekAgo;
      } else if (dateFilter === "month") {
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        matchesDate = saleDate >= monthAgo;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDate;
  });
  
  const [draft, setDraft] = useState({
    phoneId: sellablePhones[0]?.id ?? "",
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    salePrice: 0,
    depositAmount: 0,
    saleDate: todayISO(),
    saleDateTime: nowLocalDateTime(),
    deliveryStatus: "pending_delivery" as SaleDeliveryStatus,
    notes: ""
  });
  const [savingSale, setSavingSale] = useState(false);
  const selectedPhone = phones.find((phone) => phone.id === draft.phoneId);
  const selectedCost = selectedPhone ? phoneCost(selectedPhone, repairs, repairParts, expenses) : 0;
  const expectedProfit = Number(draft.salePrice || 0) - selectedCost;
  const remainingAmount = Math.max(0, Number(draft.salePrice || 0) - Number(draft.depositAmount || 0));
  const matchingCustomers = customers.filter((customer) => {
    const text = [customer.name, customer.phone].filter(Boolean).map(normalizeCustomerIdentity).join(" ");
    const query = [draft.customerName, draft.customerPhone].filter(Boolean).map(normalizeCustomerIdentity).join(" ");
    return query.length >= 2 && text.includes(query);
  });

  useEffect(() => {
    if (!preferredPhoneId) return;
    const phone = phones.find((item) => item.id === preferredPhoneId);
    if (!phone || !["Ready For Sale", "Reserved"].includes(phone.status)) return;
    setDraft((current) => ({
      ...current,
      phoneId: phone.id,
      salePrice: preferredSalePrice || phone.askingPrice || current.salePrice
    }));
  }, [preferredPhoneId, preferredSalePrice, phones]);

  async function submit() {
    if (savingSale) return;
    setSavingSale(true);
    try {
      const saved = await onSave(draft);
      if (saved === false) return;
      setDraft({
        ...draft,
        customerName: "",
        customerPhone: "",
        customerAddress: "",
        salePrice: 0,
        depositAmount: 0,
        deliveryStatus: "pending_delivery",
        notes: ""
      });
    } finally {
      setSavingSale(false);
    }
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
        <h2 className="text-lg font-semibold">Bán hàng</h2>
        <select
          className="field"
          value={draft.phoneId}
          onChange={(e) => {
            const phone = phones.find((item) => item.id === e.target.value);
            setDraft({ ...draft, phoneId: e.target.value, salePrice: phone?.askingPrice ?? draft.salePrice });
          }}
        >
          <option value="">Chọn máy để bán</option>
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
        <input className="field" placeholder="Địa chỉ khách hàng" value={draft.customerAddress} onChange={(e) => setDraft({ ...draft, customerAddress: e.target.value })} />
        <select className="field" value={draft.deliveryStatus} onChange={(e) => setDraft({ ...draft, deliveryStatus: e.target.value as SaleDeliveryStatus })}>
          {deliveryStatuses.map((status) => (
            <option key={status} value={status}>
              {deliveryStatusLabels[status]}
            </option>
          ))}
        </select>
        <MoneyInput
          placeholder="Giá bán ra"
          value={draft.salePrice}
          onChange={(salePrice) => setDraft({ ...draft, salePrice })}
          required
        />
        <MoneyInput
          placeholder="Số tiền cọc"
          value={draft.depositAmount}
          onChange={(depositAmount) => setDraft({ ...draft, depositAmount })}
        />
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Đã cọc" value={currency(draft.depositAmount, settings.currency)} />
          <Stat label="Còn lại" value={currency(remainingAmount, settings.currency)} />
        </div>
        <input
          className="field"
          type="datetime-local"
          value={draft.saleDateTime}
          onChange={(e) => setDraft({ ...draft, saleDateTime: e.target.value, saleDate: e.target.value.slice(0, 10) })}
        />
        <button className="btn-primary w-full" disabled={savingSale || !draft.phoneId}>
          {savingSale ? "Đang lưu..." : "Lưu bán hàng"}
        </button>
        {matchingCustomers.length > 0 && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">Lịch sử khách hàng</p>
            <div className="mt-2 space-y-2">
              {matchingCustomers.slice(0, 3).map((customer) => {
                const customerSales = sales.filter((sale) => sale.customerId === customer.id);
                return (
                  <button
                    type="button"
                    className="w-full rounded-md border bg-card p-2 text-left hover:bg-muted"
                    key={customer.id}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        customerName: customer.name,
                        customerPhone: customer.phone,
                        customerAddress: customer.address ?? draft.customerAddress
                      })
                    }
                  >
                    <span className="block font-medium">{customer.name}</span>
                    <span className="block text-xs text-slate-500">
                      {customer.phone} - {customerSales.length} lần mua
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </form>
      <div className="card overflow-hidden xl:col-span-2">
        {/* Filter section */}
        <div className="border-b p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold">Danh sách bán hàng</h3>
            <p className="text-sm text-slate-500">
              {filteredSales.length}/{sales.length} giao dịch
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            <input
              className="field"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm khách, điện thoại, IMEI..."
            />
            <select 
              className="field" 
              value={deliveryStatusFilter} 
              onChange={(e) => setDeliveryStatusFilter(e.target.value as "all" | SaleDeliveryStatus)}
            >
              <option value="all">Tất cả trạng thái</option>
              {deliveryStatuses.map((status) => (
                <option key={status} value={status}>
                  {deliveryStatusLabels[status]}
                </option>
              ))}
            </select>
            <select className="field" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}>
              <option value="all">Tất cả thời gian</option>
              <option value="today">Hôm nay</option>
              <option value="week">7 ngày qua</option>
              <option value="month">30 ngày qua</option>
            </select>
          </div>
        </div>
        
        <div className="space-y-3 p-3 md:hidden">
          {filteredSales
            .slice()
            .sort((a, b) => {
              const dateA = a.saleDateTime || a.saleDate;
              const dateB = b.saleDateTime || b.saleDate;
              return dateB.localeCompare(dateA); // Sắp xếp theo ngày bán mới nhất
            })
            .map((sale) => {
            const phone = phones.find((item) => item.id === sale.phoneId);
            const customer = customers.find((item) => item.id === sale.customerId);
            return (
              <div className="rounded-lg border bg-background p-3" key={sale.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{formatSaleDateTime(sale)}</p>
                    <h3 className="truncate font-semibold">{phone ? `${phone.brand} ${phone.model}` : "Không rõ"}</h3>
                    <p className="truncate text-sm text-slate-500">{customer?.name ?? "Không rõ khách hàng"}</p>
                    {customer?.address && <p className="line-clamp-2 text-xs text-slate-500">{customer.address}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{currency(sale.salePrice, settings.currency)}</p>
                    {sale.depositAmount > 0 && <p className="text-xs text-slate-500">Cọc {currency(sale.depositAmount, settings.currency)}</p>}
                    <p className="text-xs text-slate-500">{deliveryStatusLabels[sale.deliveryStatus]}</p>
                  </div>
                </div>
                <select
                  className="field mt-3"
                  value={sale.deliveryStatus}
                  onChange={(event) => onUpdateDeliveryStatus(sale, event.target.value as SaleDeliveryStatus)}
                >
                  {deliveryStatuses.map((status) => (
                    <option key={status} value={status}>
                      {deliveryStatusLabels[status]}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex justify-end">
                  <ActionMenu
                    label="Thao tác đơn bán"
                    items={[{ label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(sale) }]}
                  />
                </div>
              </div>
            );
          })}
          {sales.length === 0 && <div className="py-6 text-center text-sm text-slate-500">Chưa có đơn bán hàng</div>}
        </div>
        <div className="hidden overflow-auto md:block">
          <table className="w-full min-w-[1040px] text-sm">
            <thead className="bg-muted text-left">
              <tr>
                {["Ngày giờ", "Điện thoại", "Khách hàng", "Địa chỉ", "Giá bán ra", "Tiền cọc", "Còn lại", "Trạng thái", ""].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSales
                .slice()
                .sort((a, b) => {
                  const dateA = a.saleDateTime || a.saleDate;
                  const dateB = b.saleDateTime || b.saleDate;
                  return dateB.localeCompare(dateA); // Sắp xếp theo ngày bán mới nhất
                })
                .map((sale) => {
                const phone = phones.find((item) => item.id === sale.phoneId);
                const customer = customers.find((item) => item.id === sale.customerId);
                return (
                  <tr className="border-t" key={sale.id}>
                    <td className="px-4 py-3">{formatSaleDateTime(sale)}</td>
                    <td className="px-4 py-3">{phone ? `${phone.brand} ${phone.model}` : "Không rõ"}</td>
                    <td className="px-4 py-3">{customer?.name ?? "Không rõ"}</td>
                    <td className="px-4 py-3">{customer?.address || "-"}</td>
                    <td className="px-4 py-3">{currency(sale.salePrice, settings.currency)}</td>
                    <td className="px-4 py-3">{currency(sale.depositAmount, settings.currency)}</td>
                    <td className="px-4 py-3">{currency(Math.max(0, sale.salePrice - sale.depositAmount), settings.currency)}</td>
                    <td className="px-4 py-3">
                      <select
                        className="field h-9 min-w-40"
                        value={sale.deliveryStatus}
                        onChange={(event) => onUpdateDeliveryStatus(sale, event.target.value as SaleDeliveryStatus)}
                      >
                        {deliveryStatuses.map((status) => (
                          <option key={status} value={status}>
                            {deliveryStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ActionMenu
                        label="Thao tác đơn bán"
                        items={[{ label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(sale) }]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <TrashSection title="Thùng rác bán hàng" rows={deletedRows} onRestore={onRestoreDeleted} />
    </div>
  );
}

function CustomersView({
  customers,
  sales,
  phones,
  deletedRows,
  onRestoreDeleted,
  onDelete
}: {
  customers: Customer[];
  sales: Sale[];
  phones: Phone[];
  deletedRows: DeletedRow[];
  onRestoreDeleted: (row: DeletedRow) => void;
  onDelete: (customerId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {customers.map((customer) => {
          const customerSales = sales
            .filter((sale) => sale.customerId === customer.id)
            .sort((a, b) => {
              const dateA = a.saleDateTime || a.saleDate;
              const dateB = b.saleDateTime || b.saleDate;
              return dateB.localeCompare(dateA); // Sắp xếp theo ngày bán mới nhất
            });
          return (
            <div className="card p-4" key={customer.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{customer.name}</h3>
                  <p className="text-sm text-slate-500">{customer.phone}</p>
                  {customer.address && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{customer.address}</p>}
                </div>
                <ActionMenu
                  label={`Thao tác ${customer.name}`}
                  items={[{ label: "Xoá", icon: <Trash2 size={16} />, destructive: true, onClick: () => onDelete(customer.id) }]}
                />
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-semibold">Lịch sử mua: {customerSales.length} đơn</p>
                {customerSales.map((sale) => {
                  const phone = phones.find((item) => item.id === sale.phoneId);
                  return (
                    <div className="rounded-md bg-muted p-2" key={sale.id}>
                      <p className="font-medium">{phone ? `${phone.brand} ${phone.model}` : "Không rõ điện thoại"}</p>
                      <p className="text-xs text-slate-500">
                        {formatSaleDateTime(sale)} - {currency(sale.salePrice)} - Cọc {currency(sale.depositAmount)} - {deliveryStatusLabels[sale.deliveryStatus]}
                      </p>
                    </div>
                  );
                })}
                {customerSales.length === 0 && <p className="text-slate-500">Chưa có giao dịch.</p>}
              </div>
            </div>
          );
        })}
      </div>
      <TrashSection title="Thùng rác khách hàng" rows={deletedRows} onRestore={onRestoreDeleted} />
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
      formatSaleDateTime(sale),
      phone ? `${phone.brand} ${phone.model}` : "Không rõ",
      deliveryStatusLabels[sale.deliveryStatus],
      currency(sale.salePrice, props.settings.currency),
      currency(sale.depositAmount, props.settings.currency),
      currency(Math.max(0, sale.salePrice - sale.depositAmount), props.settings.currency),
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
        <DataTable headers={["Ngày", "Điện thoại", "Trạng thái", "Doanh thu", "Tiền cọc", "Còn lại", "Lợi nhuận", "Biên lợi nhuận"]} rows={rows} />
      </div>
    </div>
  );
}

function SettingsView({
  settings,
  supabaseConfigured,
  appLogs,
  onChange
}: {
  settings: Settings;
  supabaseConfigured: boolean;
  appLogs: AppLog[];
  onChange: (settings: Settings) => void;
}) {
  const [logSearch, setLogSearch] = useState("");
  const [logAction, setLogAction] = useState("all");
  const [logEntityType, setLogEntityType] = useState("all");
  const logActions = uniqueValues(appLogs.map((log) => log.action));
  const logEntityTypes = uniqueValues(appLogs.map((log) => log.entityType));
  const filteredLogs = appLogs.filter((log) => {
    const text = [log.message, log.action, log.entityType, log.entityId, formatDateTimeText(log.createdAt)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      text.includes(logSearch.toLowerCase()) &&
      (logAction === "all" || log.action === logAction) &&
      (logEntityType === "all" || log.entityType === logEntityType)
    );
  });

  return (
    <div className="space-y-4">
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

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Log hệ thống</h2>
            <p className="text-sm text-slate-500">{filteredLogs.length}/{appLogs.length} hoạt động</p>
          </div>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
          <input
            className="field"
            value={logSearch}
            onChange={(event) => setLogSearch(event.target.value)}
            placeholder="Tìm nội dung log, mã dữ liệu, ngày giờ"
          />
          <select className="field" value={logAction} onChange={(event) => setLogAction(event.target.value)}>
            <option value="all">Tất cả thao tác</option>
            {logActions.map((action) => (
              <option key={action} value={action}>
                {logActionLabels[action] ?? action}
              </option>
            ))}
          </select>
          <select className="field" value={logEntityType} onChange={(event) => setLogEntityType(event.target.value)}>
            <option value="all">Tất cả khu vực</option>
            {logEntityTypes.map((entityType) => (
              <option key={entityType} value={entityType}>
                {entityTypeLabels[entityType] ?? entityType}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-3 max-h-[520px] space-y-2 overflow-auto pr-1">
          {filteredLogs.map((log) => (
            <div className="rounded-md border bg-background p-3" key={log.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{log.message}</p>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">{logActionLabels[log.action] ?? log.action}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {formatDateTimeText(log.createdAt)} - {entityTypeLabels[log.entityType] ?? log.entityType}
                {log.entityId ? `/${log.entityId}` : ""}
              </p>
            </div>
          ))}
          {filteredLogs.length === 0 && <div className="py-4 text-sm text-slate-500">Không có log phù hợp.</div>}
        </div>
      </div>
    </div>
  );
}
