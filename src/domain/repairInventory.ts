import type { Part, Repair, RepairPart } from "../lib/types";

export function getPhoneRepairPartUsage(phoneId: string, repairs: Repair[], repairParts: RepairPart[]) {
  const repairIds = repairs.filter((repair) => repair.phoneId === phoneId).map((repair) => repair.id);
  const phoneRepairParts = repairParts.filter((repairPart) => repairIds.includes(repairPart.repairId));
  const quantities = phoneRepairParts.reduce<Record<string, number>>((acc, repairPart) => {
    acc[repairPart.partId] = (acc[repairPart.partId] ?? 0) + repairPart.quantity;
    return acc;
  }, {});

  return { repairIds, phoneRepairParts, quantities };
}

export function applyPartQuantityDelta(parts: Part[], quantities: Record<string, number>, direction: "increase" | "decrease") {
  return parts
    .filter((part) => quantities[part.id])
    .map((part) => ({
      ...part,
      quantity:
        direction === "increase"
          ? part.quantity + quantities[part.id]
          : Math.max(0, part.quantity - quantities[part.id])
    }));
}
