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
  PurchaseRequestItem,
  WarehouseIssue,
  WarehouseIssueItem,
  WarehouseIssueReceipt,
  ContractorObject,
  OtherSiteIssue,
  OtherSiteIssueItem,
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
  purchaseRequestItems: PurchaseRequestItem[];
  issues: WarehouseIssue[];
  issueItems: WarehouseIssueItem[];
  issueReceipts: WarehouseIssueReceipt[];
  otherSiteIssues: OtherSiteIssue[];
  otherSiteIssueItems: OtherSiteIssueItem[];
}

let cache: CachedData | null = null;
const listeners = new Set<(data: CachedData) => void>();

async function fetchAllRequirements(): Promise<Requirement[]> {
  const rows: Requirement[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('requirements')
      .select('*')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function fetchAll(): Promise<CachedData> {
  const requirementsPromise = fetchAllRequirements();
  const [
    { data: objects },
    { data: materials },
    { data: categories },
    { data: contractors },
    { data: contractorObjects },
    requirements,
    { data: receipts },
    { data: purchaseRequests },
    { data: purchaseRequestItems },
    { data: issues },
    { data: issueItems },
    { data: issueReceipts },
    { data: otherSiteIssues },
    { data: otherSiteIssueItems },
  ] = await Promise.all([
    supabase.from('objects').select('*').order('sequence_order'),
    supabase.from('materials').select('*').order('name'),
    supabase.from('material_categories').select('*').order('name'),
    supabase.from('contractors').select('*').order('name'),
    supabase.from('contractor_objects').select('*'),
    requirementsPromise,
    supabase.from('warehouse_receipts').select('*').order('receipt_date', { ascending: false }),
    supabase.from('purchase_requests').select('*').order('request_date', { ascending: false }),
    supabase.from('purchase_request_items').select('*'),
    supabase.from('warehouse_issues').select('*').order('issue_date', { ascending: false }),
    supabase.from('warehouse_issue_items').select('*'),
    supabase.from('warehouse_issue_receipts').select('*'),
    supabase.from('other_site_issues').select('*').order('issue_date', { ascending: false }),
    supabase.from('other_site_issue_items').select('*'),
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
    purchaseRequestItems: purchaseRequestItems || [],
    issues: issues || [],
    issueItems: issueItems || [],
    issueReceipts: issueReceipts || [],
    otherSiteIssues: otherSiteIssues || [],
    otherSiteIssueItems: otherSiteIssueItems || [],
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
    purchaseRequestItems: [],
    issues: [],
    issueItems: [],
    issueReceipts: [],
    otherSiteIssues: [],
    otherSiteIssueItems: [],
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
