import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  DbObject,
  Material,
  MaterialCategory,
  Contractor,
  Requirement,
  WarehouseReceipt,
  PurchaseRequest,
  WarehouseIssue,
  WarehouseIssueItem,
  WarehouseIssueReceipt,
  ContractorObject,
} from '@/lib/types';

interface CachedData {
  objects: DbObject[];
  materials: Material[];
  categories: MaterialCategory[];
  contractors: Contractor[];
  contractorObjects: ContractorObject[];
  requirements: Requirement[];
  receipts: WarehouseReceipt[];
  purchaseRequests: PurchaseRequest[];
  issues: WarehouseIssue[];
  issueItems: WarehouseIssueItem[];
  issueReceipts: WarehouseIssueReceipt[];
}

let cache: CachedData | null = null;
const listeners = new Set<(data: CachedData) => void>();

async function fetchAll(): Promise<CachedData> {
  const [
    { data: objects },
    { data: materials },
    { data: categories },
    { data: contractors },
    { data: contractorObjects },
    { data: requirements },
    { data: receipts },
    { data: purchaseRequests },
    { data: issues },
    { data: issueItems },
    { data: issueReceipts },
  ] = await Promise.all([
    supabase.from('objects').select('*').order('sequence_order'),
    supabase.from('materials').select('*').order('name'),
    supabase.from('material_categories').select('*').order('name'),
    supabase.from('contractors').select('*').order('name'),
    supabase.from('contractor_objects').select('*'),
    supabase.from('requirements').select('*'),
    supabase.from('warehouse_receipts').select('*').order('receipt_date', { ascending: false }),
    supabase.from('purchase_requests').select('*').order('request_date', { ascending: false }),
    supabase.from('warehouse_issues').select('*').order('issue_date', { ascending: false }),
    supabase.from('warehouse_issue_items').select('*'),
    supabase.from('warehouse_issue_receipts').select('*'),
  ]);

  return {
    objects: objects || [],
    materials: materials || [],
    categories: categories || [],
    contractors: contractors || [],
    contractorObjects: contractorObjects || [],
    requirements: requirements || [],
    receipts: receipts || [],
    purchaseRequests: purchaseRequests || [],
    issues: issues || [],
    issueItems: issueItems || [],
    issueReceipts: issueReceipts || [],
  };
}

export function useData() {
  const [data, setData] = useState<CachedData>(cache || {
    objects: [],
    materials: [],
    categories: [],
    contractors: [],
    contractorObjects: [],
    requirements: [],
    receipts: [],
    purchaseRequests: [],
    issues: [],
    issueItems: [],
    issueReceipts: [],
  });
  const [loading, setLoading] = useState(!cache);

  const refresh = useCallback(async () => {
    const fresh = await fetchAll();
    cache = fresh;
    listeners.forEach((l) => l(fresh));
  }, []);

  useEffect(() => {
    if (cache) {
      setData(cache);
      setLoading(false);
    }
    listeners.add(setData);
    if (!cache) {
      fetchAll()
        .then((fresh) => {
          cache = fresh;
          setData(fresh);
          setLoading(false);
        })
        .catch((e) => {
          console.error('Failed to fetch data:', e);
          setLoading(false);
        });
    }
    return () => {
      listeners.delete(setData);
    };
  }, []);

  return { data, loading, refresh };
}
