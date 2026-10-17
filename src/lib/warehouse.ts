import type { PurchaseRequest, WarehouseReceipt } from '@/lib/types';

export function getWarehouseInboundByMaterial(
  receipts: WarehouseReceipt[],
  purchaseRequests: PurchaseRequest[],
): Map<string, number> {
  const receiptTotals = new Map<string, number>();
  const deliveredTotals = new Map<string, number>();

  for (const receipt of receipts) {
    receiptTotals.set(receipt.material_id, (receiptTotals.get(receipt.material_id) || 0) + receipt.quantity);
  }

  for (const request of purchaseRequests) {
    if (request.status !== 'delivered') continue;
    deliveredTotals.set(request.material_id, (deliveredTotals.get(request.material_id) || 0) + request.total_quantity);
  }

  const inbound = new Map<string, number>(receiptTotals);
  for (const [materialId, deliveredQuantity] of deliveredTotals) {
    inbound.set(materialId, Math.max(inbound.get(materialId) || 0, deliveredQuantity));
  }

  return inbound;
}
