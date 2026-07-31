import { MoreVertical, Search, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { statusLabels } from "../domain/constants";
import type { DeletedRow, PhoneStatus } from "../lib/types";
import { cn } from "../lib/utils";
import { formatDateTimeText } from "./helpers";

export function ActionMenu({
  label,
  items,
  align = "right"
}: {
  label: string;
  align?: "right" | "full";
  items: { label: string; icon?: ReactNode; destructive?: boolean; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className={cn("relative inline-flex", align === "full" && "w-full")} ref={menuRef}>
      <button className={cn("btn-secondary h-9 px-2", align === "full" && "w-full")} type="button" aria-label={label} onClick={() => setOpen((current) => !current)}>
        <MoreVertical size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 min-w-40 overflow-hidden rounded-md border bg-card py-1 text-left shadow-lg">
          {items.map((item) => (
            <button
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted",
                item.destructive && "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
              )}
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TrashSection({ title, rows, onRestore }: { title: string; rows: DeletedRow[]; onRestore: (row: DeletedRow) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <div className="w-full">
        <div className="flex justify-end">
          <button className="btn-secondary relative" type="button" aria-label={title} onClick={() => setOpen((current) => !current)}>
            <Trash2 size={18} />
            {rows.length > 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                {rows.length}
              </span>
            )}
          </button>
        </div>
        {open && (
          <div className="card mt-3 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-slate-500">{rows.length} bản ghi trong thùng rác</p>
            </div>
            <div className="space-y-2">
              {rows.slice(0, 30).map((row) => (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3" key={`${row.table}-${row.id}`}>
                  <div className="min-w-0">
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-slate-500">
                      {row.table} - {formatDateTimeText(row.deletedAt)}
                    </p>
                  </div>
                  <button className="btn-secondary" type="button" onClick={() => onRestore(row)}>
                    Khôi phục
                  </button>
                </div>
              ))}
              {rows.length === 0 && <div className="py-4 text-sm text-slate-500">Thùng rác đang trống.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
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

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Input({
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

export function MoneyInput({
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

export function NumericInput({
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

export function SuggestInput({
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

export function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
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

export function PaginationControls({
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

export function StatusPill({ status }: { status: PhoneStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "Sold" && "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100",
        status === "Ready For Sale" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
        status.includes("Repair") && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
        status === "Waiting Inspection" && "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200",
        status === "Purchased" && "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
        status === "Reserved" && "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200"
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

export function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-md bg-muted p-3", warn && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200")}>
      <p className="label">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
