export type ObjectType = 'station' | 'crossover' | 'stretch';

export interface DbObject {
  id: string;
  type: ObjectType;
  name: string;
  code: string | null;
  sequence_order: number;
  from_object_id: string | null;
  to_object_id: string | null;
  created_at: string;
}

export interface MaterialCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface Material {
  id: string;
  name: string;
  article: string | null;
  unit: string;
  category_id: string | null;
  created_at: string;
}

export interface Requirement {
  id: string;
  material_id: string;
  object_id: string;
  quantity: number;
  created_at: string;
}

export interface RequirementCorrection {
  id: string;
  requirement_id: string;
  material_id: string;
  object_id: string;
  old_quantity: number;
  new_quantity: number;
  reason: string | null;
  changed_by: string;
  changed_at: string;
}

export interface Contractor {
  id: string;
  name: string;
  contact: string | null;
  created_at: string;
}

export interface ContractorObject {
  id: string;
  contractor_id: string;
  object_id: string;
}

export interface WarehouseReceipt {
  id: string;
  material_id: string;
  quantity: number;
  receipt_date: string;
  supplier: string | null;
  document_url: string | null;
  notes: string | null;
  created_at: string;
}

export type PurchaseRequestType = 'rk' | 'rf';
export type PurchaseRequestStatus = 'draft' | 'submitted' | 'accepted' | 'in_transit' | 'delivered' | 'cancelled';

export interface PurchaseRequest {
  id: string;
  material_id: string;
  total_quantity: number;
  request_type: PurchaseRequestType;
  status: PurchaseRequestStatus;
  request_date: string;
  expected_delivery_date: string | null;
  actual_delivery_date: string | null;
  notes: string | null;
  created_at: string;
}

export interface PurchaseRequestItem {
  id: string;
  purchase_request_id: string;
  object_id: string;
  quantity: number;
}

export type WarehouseIssueStatus = 'planned' | 'confirmed' | 'cancelled';

export interface WarehouseIssue {
  id: string;
  contractor_id: string;
  issue_date: string;
  status: WarehouseIssueStatus;
  notes: string | null;
  created_at: string;
}

export interface WarehouseIssueItem {
  id: string;
  warehouse_issue_id: string;
  material_id: string;
  object_id: string;
  quantity: number;
}

export interface WarehouseIssueReceipt {
  id: string;
  warehouse_issue_id: string;
  warehouse_issue_item_id: string;
  material_id: string;
  object_id: string;
  ordered_quantity: number;
  received_quantity: number;
  reason: string | null;
  received_at: string;
}

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  station: 'Станция',
  crossover: 'Разъезд',
  stretch: 'Перегон',
};

export const PR_STATUS_LABELS: Record<PurchaseRequestStatus, string> = {
  draft: 'Черновик',
  submitted: 'Подана',
  accepted: 'Принята в работу',
  in_transit: 'В пути',
  delivered: 'Поставлена',
  cancelled: 'Отменена',
};

export const PR_STATUS_COLORS: Record<PurchaseRequestStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  accepted: 'bg-amber-100 text-amber-700',
  in_transit: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const PR_TYPE_LABELS: Record<PurchaseRequestType, string> = {
  rk: 'РК (местное размещение)',
  rf: 'РФ (неместное размещение)',
};

export const ISSUE_STATUS_LABELS: Record<WarehouseIssueStatus, string> = {
  planned: 'Запланировано',
  confirmed: 'Подтверждено',
  cancelled: 'Отменено',
};

export const ISSUE_STATUS_COLORS: Record<WarehouseIssueStatus, string> = {
  planned: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};
