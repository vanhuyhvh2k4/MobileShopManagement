import { Smartphone, X } from "lucide-react";
import { useState } from "react";
import { editablePhoneStatuses, statusLabels } from "../domain/constants";
import { phoneCost } from "../lib/calculations";
import type { Expense, Part, PartImport, Phone, PhoneStatus, Repair, RepairPart, Settings } from "../lib/types";
import { cn, currency } from "../lib/utils";
import { fileToDataUrl, isPartRecommendedForPhone, uniqueValues } from "../shared/helpers";
import { Input, Labeled, Modal, MoneyInput, NumericInput, Stat, SuggestInput } from "../shared/ui";

export function PhoneDialog({
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
          void onSave(draft, faultText.split(","));
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
        <MoneyInput label="Tiền cọc" value={draft.purchaseDeposit ?? 0} onChange={(purchaseDeposit) => setDraft({ ...draft, purchaseDeposit })} />
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
              {editablePhoneStatuses.map((status) => (
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

export function RepairDialog({
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
                  <td className="px-4 py-6 text-center text-slate-500" colSpan={10}>
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

export function PartDialog({
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
        <MoneyInput label="Giá nhập mới nhất" value={draft.purchaseCost} onChange={(purchaseCost) => setDraft({ ...draft, purchaseCost })} />
        <NumericInput label="Tồn hiện tại" value={draft.quantity} onChange={(quantity) => setDraft({ ...draft, quantity })} />
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

export function PartImportDialog({
  part,
  partImport,
  onClose,
  onSave
}: {
  part: Part;
  partImport: PartImport;
  onClose: () => void;
  onSave: (part: Part, partImport: PartImport) => void;
}) {
  const [draft, setDraft] = useState(partImport);
  const total = Number(draft.quantity || 0) * Number(draft.unitCost || 0);
  return (
    <Modal title={`Nhập kho: ${part.name}`} onClose={onClose}>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(part, draft);
        }}
      >
        <div className="rounded-lg border bg-muted/30 p-3 md:col-span-2">
          <p className="font-semibold">
            {part.brand ? `${part.brand} - ` : ""}
            {part.name}
          </p>
          <p className="text-sm text-slate-500">Tồn hiện tại: {part.quantity}</p>
        </div>
        <NumericInput label="Số lượng nhập" value={draft.quantity} onChange={(quantity) => setDraft({ ...draft, quantity })} required />
        <MoneyInput label="Đơn giá nhập" value={draft.unitCost} onChange={(unitCost) => setDraft({ ...draft, unitCost })} required />
        <Labeled label="Ngày giờ nhập">
          <input
            className="field"
            type="datetime-local"
            value={draft.importDateTime}
            onChange={(event) => setDraft({ ...draft, importDateTime: event.target.value })}
            required
          />
        </Labeled>
        <Input label="Nhà cung cấp" value={draft.supplier ?? ""} onChange={(supplier) => setDraft({ ...draft, supplier })} />
        <div className="rounded-lg bg-muted p-3 md:col-span-2">
          <p className="label">Tổng tiền nhập</p>
          <p className="mt-1 text-lg font-semibold">{currency(total)}</p>
        </div>
        <label className="md:col-span-2">
          <span className="label">Ghi chú</span>
          <textarea className="field min-h-20 py-3" value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
        </label>
        <div className="flex justify-end gap-2 md:col-span-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Hủy
          </button>
          <button className="btn-primary">Lưu nhập kho</button>
        </div>
      </form>
    </Modal>
  );
}

