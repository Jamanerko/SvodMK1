import type { DbObject, PurchaseRequest, PurchaseRequestItem, Requirement } from '@/lib/types';

export type ReadinessTone = 'gray' | 'red' | 'amber' | 'green';
export type CoverageStatus = 'none' | 'missing' | 'partial' | 'full';

export const READINESS_TONE_LABELS: Record<ReadinessTone, string> = {
  gray: 'Не начато',
  red: 'Отставание',
  amber: 'В процессе',
  green: 'Готово',
};

export const READINESS_TONE_STYLES: Record<ReadinessTone, { bar: string; stroke: string; text: string; bg: string; border: string }> = {
  gray: { bar: 'bg-slate-400', stroke: 'stroke-slate-400', text: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300' },
  red: { bar: 'bg-red-500', stroke: 'stroke-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300' },
  amber: { bar: 'bg-amber-500', stroke: 'stroke-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300' },
  green: { bar: 'bg-emerald-500', stroke: 'stroke-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-300' },
};

export const READINESS_TONE_HEX: Record<ReadinessTone, number> = {
  gray: 0x94a3b8,
  red: 0xef4444,
  amber: 0xf59e0b,
  green: 0x10b981,
};

export function getReadinessTone(percent: number): ReadinessTone {
  if (percent <= 0) return 'gray';
  if (percent <= 25) return 'red';
  if (percent <= 75) return 'amber';
  return 'green';
}

export interface Coverage {
  required: number;
  covered: number;
  percent: number | null;
  status: CoverageStatus;
}

export const COVERAGE_LABELS: Record<CoverageStatus, string> = {
  none: 'Потребности нет',
  missing: 'Не обеспечено',
  partial: 'Частично обеспечено',
  full: 'Обеспечено',
};

export const COVERAGE_BADGE_COLORS: Record<CoverageStatus, string> = {
  none: 'bg-slate-100 text-slate-600',
  missing: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  full: 'bg-emerald-100 text-emerald-700',
};

interface Cell {
  required: number;
  ordered: number;
}

/**
 * Coverage per material is capped at the requirement, so surplus of one material never hides a shortage of another.
 * With `rollup`, a main object's coverage includes its sub-objects' requirements and orders.
 */
export function computeCoverage(
  objects: DbObject[],
  requirements: Requirement[],
  purchaseRequests: PurchaseRequest[],
  purchaseRequestItems: PurchaseRequestItem[],
  rollup: boolean,
): Map<string, Coverage> {
  const parentOf = new Map(objects.map((o) => [o.id, o.parent_id]));
  const groupOf = (objectId: string) => (rollup ? parentOf.get(objectId) ?? objectId : objectId);

  const prById = new Map(purchaseRequests.map((p) => [p.id, p]));
  const cells = new Map<string, Map<string, Cell>>();
  const cell = (group: string, materialId: string): Cell => {
    let byMaterial = cells.get(group);
    if (!byMaterial) {
      byMaterial = new Map();
      cells.set(group, byMaterial);
    }
    let entry = byMaterial.get(materialId);
    if (!entry) {
      entry = { required: 0, ordered: 0 };
      byMaterial.set(materialId, entry);
    }
    return entry;
  };

  for (const req of requirements) {
    cell(groupOf(req.object_id), req.material_id).required += req.quantity;
  }
  for (const item of purchaseRequestItems) {
    const pr = prById.get(item.purchase_request_id);
    if (!pr || pr.status === 'cancelled') continue;
    cell(groupOf(item.object_id), pr.material_id).ordered += item.quantity;
  }

  const result = new Map<string, Coverage>();
  for (const [group, byMaterial] of cells) {
    let required = 0;
    let covered = 0;
    for (const { required: r, ordered } of byMaterial.values()) {
      required += r;
      covered += Math.min(r, ordered);
    }
    const percent = required > 0 ? Math.min(100, Math.round((covered / required) * 100)) : null;
    const status: CoverageStatus =
      required <= 0 ? 'none' : covered >= required ? 'full' : covered <= 0 ? 'missing' : 'partial';
    result.set(group, { required, covered, percent, status });
  }
  return result;
}

export function getOverallProgress(objects: DbObject[]): number {
  if (objects.length === 0) return 0;
  const sum = objects.reduce((acc, o) => acc + o.progress_percent, 0);
  return Math.round(sum / objects.length);
}
