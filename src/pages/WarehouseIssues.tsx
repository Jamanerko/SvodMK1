import { useState, useMemo } from 'react';
import { Plus, Truck, Trash2, Edit3, Search, Download, X, CheckCircle, Clock, Layers, ShoppingCart, MapPin } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, SearchSelect, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel } from '@/lib/export';
import { getWarehouseInboundByMaterial } from '@/lib/warehouse';
import { ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS, type WarehouseIssueStatus } from '@/lib/types';

interface IssueFormItem {
  material_id: string;
  object_id: string;
  quantity: string;
  drum_number: string;
}

const formatQuantity = (quantity: number) => quantity.toLocaleString('ru-RU', { maximumFractionDigits: 3 });

export default function WarehouseIssues() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    contractor_id: '',
    issue_date: '',
    status: 'planned' as WarehouseIssueStatus,
    notes: '',
  });
  const [items, setItems] = useState<IssueFormItem[]>([]);
  const [search, setSearch] = useState('');
  const [filterContractor, setFilterContractor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'contractors' | 'other'>('contractors');

  // Other-site issue form
  const [otherModalOpen, setOtherModalOpen] = useState(false);
  const [otherForm, setOtherForm] = useState({ issue_date: new Date().toISOString().slice(0, 10), site_name: '', received_by: '', notes: '' });
  const [otherItems, setOtherItems] = useState<{ material_id: string; material_name: string; quantity: string; unit: string }[]>([]);
  const [otherDetailOpen, setOtherDetailOpen] = useState<string | null>(null);

  const otherItemsByIssue = useMemo(() => {
    const map = new Map<string, typeof data.otherSiteIssueItems>();
    for (const item of data.otherSiteIssueItems) {
      const arr = map.get(item.other_site_issue_id) || [];
      arr.push(item);
      map.set(item.other_site_issue_id, arr);
    }
    return map;
  }, [data.otherSiteIssueItems]);

  const openOtherCreate = () => {
    setOtherForm({ issue_date: new Date().toISOString().slice(0, 10), site_name: '', received_by: '', notes: '' });
    setOtherItems([{ material_id: '', material_name: '', quantity: '', unit: '' }]);
    setOtherModalOpen(true);
  };

  const addOtherRow = () => setOtherItems([...otherItems, { material_id: '', material_name: '', quantity: '', unit: '' }]);
  const removeOtherRow = (idx: number) => setOtherItems(otherItems.filter((_, i) => i !== idx));

  const handleOtherSave = async () => {
    if (!otherForm.site_name.trim()) return;
    const validItems = otherItems.filter((it) => it.material_name.trim() && it.quantity);
    if (validItems.length === 0) return;
    const { data: inserted } = await supabase.from('other_site_issues').insert({
      issue_date: otherForm.issue_date,
      site_name: otherForm.site_name.trim(),
      received_by: otherForm.received_by.trim() || null,
      notes: otherForm.notes.trim() || null,
    }).select().single();
    if (inserted) {
      await supabase.from('other_site_issue_items').insert(
        validItems.map((it) => ({
          other_site_issue_id: inserted.id,
          material_id: it.material_id || null,
          material_name: it.material_name.trim(),
          quantity: parseFloat(it.quantity),
          unit: it.unit.trim() || null,
        })),
      );
    }
    setOtherModalOpen(false);
    await refresh();
  };

  const handleOtherDelete = async (id: string) => {
    if (!confirm('Удалить запись?')) return;
    await supabase.from('other_site_issues').delete().eq('id', id);
    await refresh();
  };

  // Per-material issue modal (table-based flow)
  const [issueMaterialId, setIssueMaterialId] = useState<string | null>(null);
  const [issueContractor, setIssueContractor] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [issueAdditionalObjects, setIssueAdditionalObjects] = useState('');
  const [issueComment, setIssueComment] = useState('');
  const [issueReceivedBy, setIssueReceivedBy] = useState('');
  const [issueRows, setIssueRows] = useState<{ object_id: string; required: number; available: number; issueQty: string; drumNumber: string }[]>([]);

  const contractorMap = useMemo(() => new Map(data.contractors.map((c) => [c.id, c])), [data.contractors]);
  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const objectMap = useMemo(() => new Map(data.objects.map((o) => [o.id, o])), [data.objects]);

  const itemsByIssue = useMemo(() => {
    const map = new Map<string, typeof data.issueItems>();
    for (const item of data.issueItems) {
      const arr = map.get(item.warehouse_issue_id) || [];
      arr.push(item);
      map.set(item.warehouse_issue_id, arr);
    }
    return map;
  }, [data.issueItems]);

  // Non-cancelled issue items grouped by material
  const issuedByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    const validIssueIds = new Set(data.issues.filter((i) => i.status !== 'cancelled').map((i) => i.id));
    for (const item of data.issueItems) {
      if (validIssueIds.has(item.warehouse_issue_id)) {
        map.set(item.material_id, (map.get(item.material_id) || 0) + item.quantity);
      }
    }
    return map;
  }, [data.issueItems, data.issues]);

  // Non-cancelled issue items grouped by material+object key
  const issuedByMaterialAndObject = useMemo(() => {
    const map = new Map<string, number>();
    const validIssueIds = new Set(data.issues.filter((i) => i.status !== 'cancelled').map((i) => i.id));
    for (const item of data.issueItems) {
      if (!validIssueIds.has(item.warehouse_issue_id)) continue;
      const key = `${item.material_id}:${item.object_id}`;
      map.set(key, (map.get(key) || 0) + item.quantity);
    }
    return map;
  }, [data.issueItems, data.issues]);

  // Same, but excludes the issue currently being edited (for "previously issued" display)
  const issuedByMaterialAndObjectExcludingEdit = useMemo(() => {
    const map = new Map<string, number>();
    const validIssueIds = new Set(
      data.issues.filter((i) => i.status !== 'cancelled' && i.id !== editing).map((i) => i.id),
    );
    for (const item of data.issueItems) {
      if (!validIssueIds.has(item.warehouse_issue_id)) continue;
      const key = `${item.material_id}:${item.object_id}`;
      map.set(key, (map.get(key) || 0) + item.quantity);
    }
    return map;
  }, [data.issueItems, data.issues, editing]);

  // Received by material, including delivered purchase requests
  const receivedByMaterial = useMemo(
    () => getWarehouseInboundByMaterial(data.receipts, data.purchaseRequests),
    [data.receipts, data.purchaseRequests],
  );

  // Required by material per object (for the issue breakdown)
  const requiredByMaterial = useMemo(() => {
    const map = new Map<string, { object_id: string; required: number }[]>();
    for (const req of data.requirements) {
      const arr = map.get(req.material_id) || [];
      arr.push({ object_id: req.object_id, required: req.quantity });
      map.set(req.material_id, arr);
    }
    return map;
  }, [data.requirements]);

  const requirementByMaterialAndObject = useMemo(() => {
    const map = new Map<string, number>();
    for (const requirement of data.requirements) {
      map.set(`${requirement.material_id}:${requirement.object_id}`, requirement.quantity);
    }
    return map;
  }, [data.requirements]);

  const objectIdsByContractor = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const relation of data.contractorObjects) {
      const objectIds = map.get(relation.contractor_id) || new Set<string>();
      objectIds.add(relation.object_id);
      map.set(relation.contractor_id, objectIds);
    }
    return map;
  }, [data.contractorObjects]);

  const inspectionBlockedByMaterial = useMemo(() => {
    const inspectionMap = new Map(data.inspections.map((inspection) => [inspection.id, inspection]));
    const map = new Map<string, number>();
    for (const item of data.inspectionItems) {
      const inspection = inspectionMap.get(item.inspection_id);
      if (!inspection || inspection.status === 'cancelled') continue;
      const blocked = inspection.status === 'in_review' ? item.transferred_quantity : item.defective_quantity;
      map.set(item.material_id, (map.get(item.material_id) || 0) + blocked);
    }
    return map;
  }, [data.inspections, data.inspectionItems]);

  const issuedByDrum = useMemo(() => {
    const map = new Map<string, number>();
    // Exclude the issue currently being edited so its own drums remain selectable
    const validIssueIds = new Set(
      data.issues
        .filter((issue) => issue.status !== 'cancelled' && issue.id !== editing)
        .map((issue) => issue.id),
    );
    for (const item of data.issueItems) {
      if (!item.drum_number || !validIssueIds.has(item.warehouse_issue_id)) continue;
      const key = `${item.material_id}:${item.drum_number}`;
      map.set(key, (map.get(key) || 0) + item.quantity);
    }
    return map;
  }, [data.issues, data.issueItems, editing]);

  const getRequirement = (materialId: string, objectId: string): number =>
    requirementByMaterialAndObject.get(`${materialId}:${objectId}`) || 0;

  const getIssuedForObject = (materialId: string, objectId: string): number =>
    issuedByMaterialAndObject.get(`${materialId}:${objectId}`) || 0;

  const getPrevIssuedForObject = (materialId: string, objectId: string): number =>
    issuedByMaterialAndObjectExcludingEdit.get(`${materialId}:${objectId}`) || 0;

  interface ObjectOption { id: string; label: string; remaining: number; closed: boolean; }

  const getContractorObjectOptions = (contractorId: string, materialId: string): ObjectOption[] => {
    const allowedIds = objectIdsByContractor.get(contractorId);
    const objects = allowedIds ? data.objects.filter((o) => allowedIds.has(o.id)) : data.objects;
    const unit = materialMap.get(materialId)?.unit || '';
    return objects.map((o) => {
      const req = materialId ? getRequirement(materialId, o.id) : 0;
      const issued = materialId ? getIssuedForObject(materialId, o.id) : 0;
      const remaining = Math.max(0, req - issued);
      const closed = req > 0 && remaining <= 0;
      let label = o.name;
      if (materialId && req > 0) {
        if (closed) {
          label = `${o.name} — закрыто (выдано ${issued.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${unit})`;
        } else if (issued > 0) {
          label = `${o.name} — остаток: ${remaining.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${unit}`;
        } else {
          label = `${o.name} — нужно: ${req.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${unit}`;
        }
      }
      return { id: o.id, label, remaining, closed };
    }).sort((a, b) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      return 0;
    });
  };

  const getSuggestedDrum = (materialId: string, objectId: string, excludeIdx?: number): string => {
    const requirement = getRequirement(materialId, objectId);
    if (!materialId) return '';
    const drums = getAvailableDrums(materialId, excludeIdx);
    if (!requirement) return drums[0]?.drumNumber || '';
    return drums.find((d) => d.available >= requirement)?.drumNumber || drums[0]?.drumNumber || '';
  };

  const updateIssueItem = (index: number, changes: Partial<IssueFormItem>) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...changes };
      if (changes.material_id !== undefined || changes.object_id !== undefined) {
        const requirement = getRequirement(next.material_id, next.object_id);
        next.quantity = requirement ? String(requirement) : '';
        next.drum_number = next.material_id && next.object_id
          ? getSuggestedDrum(next.material_id, next.object_id)
          : '';
      }
      return next;
    }));
  };

  // Materials with available stock (for issue table)
  const stockMaterials = useMemo(() => {
    return data.materials
      .map((m) => {
        const received = receivedByMaterial.get(m.id) || 0;
        const issued = issuedByMaterial.get(m.id) || 0;
        const inspectionBlocked = inspectionBlockedByMaterial.get(m.id) || 0;
        return { material: m, received, issued, inspectionBlocked, available: received - issued - inspectionBlocked };
      })
      .filter((d) => d.available > 0.01)
      .sort((a, b) => b.available - a.available);
  }, [data.materials, receivedByMaterial, issuedByMaterial, inspectionBlockedByMaterial]);

  const visibleStockMaterials = useMemo(() => {
    const query = stockSearch.trim().toLowerCase();
    if (!query) return stockMaterials;
    return stockMaterials.filter(({ material }) =>
      `${material.name} ${material.article || ''}`.toLowerCase().includes(query),
    );
  }, [stockMaterials, stockSearch]);

  const getIssueMaterialOptions = (selectedId: string): Array<{ value: string; label: string }> => {
    const options = stockMaterials.map(({ material, available }) => ({
      value: material.id,
      label: `${material.name}${material.article ? ` (${material.article})` : ''} — доступно: ${available.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${material.unit}`,
    }));
    if (selectedId && !options.some((option) => option.value === selectedId)) {
      const material = materialMap.get(selectedId);
      if (material) {
        options.push({
          value: material.id,
          label: `${material.name}${material.article ? ` (${material.article})` : ''} — нет остатка`,
        });
      }
    }
    return options;
  };

  const getAvailableDrums = (materialId: string, excludeIdx?: number): Array<{ drumNumber: string; available: number }> => {
    // Drums already issued in the DB (outside this edit) are fully blocked — a drum goes to one site only
    const dbIssuedDrums = new Set(
      Array.from(issuedByDrum.entries())
        .filter(([key, qty]) => key.startsWith(`${materialId}:`) && qty > 0)
        .map(([key]) => key.slice(materialId.length + 1)),
    );
    // Drums assigned in other rows of the current form
    const inFormIssued = new Map<string, number>();
    for (const [i, it] of items.entries()) {
      if (i === excludeIdx || it.material_id !== materialId || !it.drum_number) continue;
      inFormIssued.set(it.drum_number, (inFormIssued.get(it.drum_number) || 0) + (parseFloat(it.quantity) || 0));
    }
    return data.receipts
      .filter((r) => r.material_id === materialId && r.drum_number && !dbIssuedDrums.has(r.drum_number!))
      .map((r) => ({
        drumNumber: r.drum_number as string,
        available: Math.max(0, r.quantity - (inFormIssued.get(r.drum_number!) || 0)),
      }))
      .filter((d) => d.available > 0)
      .sort((a, b) => b.available - a.available);
  };

  const getObjectTotalAssigned = (materialId: string, objectId: string): number => {
    if (!materialId || !objectId) return 0;
    return items
      .filter((it) => it.material_id === materialId && it.object_id === objectId)
      .reduce((sum, it) => sum + (parseFloat(it.quantity) || 0), 0);
  };

  const addDrumRowForObject = (materialId: string, objectId: string) => {
    setItems((current) => [...current, { material_id: materialId, object_id: objectId, quantity: '', drum_number: '' }]);
  };

  const enriched = useMemo(() => {
    return data.issues.map((i) => ({ ...i, contractor: contractorMap.get(i.contractor_id) }));
  }, [data.issues, contractorMap]);

  const filtered = useMemo(() => {
    return enriched.filter((i) => {
      if (filterContractor && i.contractor_id !== filterContractor) return false;
      if (filterStatus && i.status !== filterStatus) return false;
      if (search) {
        const s = search.toLowerCase();
        return (i.contractor?.name || '').toLowerCase().includes(s) || (i.notes || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [enriched, search, filterContractor, filterStatus]);

  const openCreate = () => {
    setEditing(null);
    setForm({ contractor_id: '', issue_date: new Date().toISOString().slice(0, 10), status: 'planned', notes: '' });
    setItems([]);
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    const issue = data.issues.find((x) => x.id === id);
    if (!issue) return;
    setEditing(id);
    setForm({ contractor_id: issue.contractor_id, issue_date: issue.issue_date, status: issue.status, notes: issue.notes || '' });
    const issueItems = itemsByIssue.get(id) || [];
    setItems(issueItems.map((it) => ({
      material_id: it.material_id,
      object_id: it.object_id,
      quantity: String(it.quantity),
      drum_number: it.drum_number || getSuggestedDrum(it.material_id, it.object_id),
    })));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.contractor_id) return;
    const payload = { contractor_id: form.contractor_id, issue_date: form.issue_date, status: form.status, notes: form.notes || null };
    let issueId = editing;
    if (editing) {
      await supabase.from('warehouse_issues').update(payload).eq('id', editing);
      await supabase.from('warehouse_issue_items').delete().eq('warehouse_issue_id', editing);
    } else {
      const { data: inserted } = await supabase.from('warehouse_issues').insert(payload).select().single();
      issueId = inserted?.id;
    }
    if (issueId) {
      const validItems = items.filter((it) => it.material_id && it.object_id && it.quantity);
      if (validItems.length > 0) {
        await supabase.from('warehouse_issue_items').insert(
          validItems.map((it) => ({
            warehouse_issue_id: issueId, material_id: it.material_id, object_id: it.object_id, quantity: parseFloat(it.quantity), drum_number: it.drum_number || null,
          })),
        );
      }
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить выдачу?')) return;
    await supabase.from('warehouse_issues').delete().eq('id', id);
    await refresh();
  };

  const handleStatusChange = async (id: string, status: WarehouseIssueStatus) => {
    await supabase.from('warehouse_issues').update({ status }).eq('id', id);
    await refresh();
  };

  const addItemRow = () => setItems([...items, { material_id: '', object_id: '', quantity: '', drum_number: '' }]);
  const removeItemRow = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  // Open per-material issue modal
  const openIssueModal = (materialId: string) => {
    setIssueMaterialId(materialId);
    setIssueContractor('');
    setIssueDate(new Date().toISOString().slice(0, 10));
    setIssueAdditionalObjects('');
    setIssueComment('');
    setIssueReceivedBy('');
    setIssueRows([]);
  };

  const handleIssueContractorChange = (contractorId: string) => {
    setIssueContractor(contractorId);
    const allowedObjectIds = objectIdsByContractor.get(contractorId) || new Set<string>();
    const requirements = new Map(
      (requiredByMaterial.get(issueMaterialId || '') || []).map((req) => [req.object_id, req.required]),
    );
    setIssueRows(
      data.objects
        .filter((object) => allowedObjectIds.has(object.id))
        .map((object) => ({
          object_id: object.id,
          required: requirements.get(object.id) || 0,
          available: 0,
          issueQty: '',
          drumNumber: getSuggestedDrum(issueMaterialId || '', object.id),
        })),
    );
  };

  const handleIssueSubmit = async () => {
    if (!issueMaterialId || !issueContractor) return;
    const validRows = issueRows.filter((r) => r.issueQty && parseFloat(r.issueQty) > 0);
    if (validRows.length === 0) return;

    const { data: inserted } = await supabase.from('warehouse_issues').insert({
      contractor_id: issueContractor,
      issue_date: issueDate,
      status: 'planned',
      additional_objects: issueAdditionalObjects.trim() || null,
      issue_comment: issueComment.trim() || null,
      received_by: issueReceivedBy.trim() || null,
    }).select().single();

    if (inserted) {
      await supabase.from('warehouse_issue_items').insert(
        validRows.map((r) => ({
          warehouse_issue_id: inserted.id,
          material_id: issueMaterialId,
          object_id: r.object_id,
          quantity: parseFloat(r.issueQty),
          drum_number: r.drumNumber.trim() || null,
        })),
      );
    }
    setIssueMaterialId(null);
    await refresh();
  };

  const handleExport = () => {
    const rows: any[] = [];
    for (const issue of filtered) {
      const issueItems = itemsByIssue.get(issue.id) || [];
      if (issueItems.length === 0) {
        rows.push({ 'Дата': issue.issue_date, 'Подрядчик': issue.contractor?.name || '', 'Статус': ISSUE_STATUS_LABELS[issue.status], 'Материал': '', 'Объект': '', 'Кол-во': '' });
      } else {
        for (const item of issueItems) {
          rows.push({
            'Дата': issue.issue_date, 'Подрядчик': issue.contractor?.name || '', 'Статус': ISSUE_STATUS_LABELS[issue.status],
            'Материал': materialMap.get(item.material_id)?.name || '', 'Объект': objectMap.get(item.object_id)?.name || '', 'Кол-во': item.quantity,
          });
        }
      }
    }
    exportToExcel(rows, 'Выдача', 'vydacha');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('contractors')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'contractors' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="flex items-center gap-2"><Truck className="w-4 h-4" /> Выдача подрядчикам</span>
        </button>
        <button
          onClick={() => setActiveTab('other')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'other' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <span className="flex items-center gap-2"><MapPin className="w-4 h-4" /> Выдача на другие участки</span>
        </button>
      </div>

      {activeTab === 'contractors' && (
      <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего выдач: {data.issues.length}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setStockModalOpen(true)}>
            <ShoppingCart className="w-4 h-4" /> Выдать по таблице
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Новая выдача
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Выдача со склада"
          subtitle="Выдача материалов на конкретные объекты"
          action={
            <button onClick={handleExport} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          }
        />
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск..." className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <Select value={filterContractor} onChange={setFilterContractor} options={data.contractors.map((c) => ({ value: c.id, label: c.name }))} placeholder="Все подрядчики" className="sm:w-48" />
          <Select value={filterStatus} onChange={setFilterStatus} options={(Object.keys(ISSUE_STATUS_LABELS) as WarehouseIssueStatus[]).map((s) => ({ value: s, label: ISSUE_STATUS_LABELS[s] }))} placeholder="Все статусы" className="sm:w-40" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Truck} message="Выдач нет" />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                  <th className="text-left px-4 py-2.5 font-medium">Подрядчик</th>
                  <th className="text-center px-4 py-2.5 font-medium">Позиций</th>
                  <th className="text-left px-4 py-2.5 font-medium">Статус</th>
                  <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((issue) => {
                  const issueItems = itemsByIssue.get(issue.id) || [];
                  return (
                    <tr key={issue.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{new Date(issue.issue_date).toLocaleDateString('ru-RU')}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{issue.contractor?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600">{issueItems.length}</td>
                      <td className="px-4 py-2.5"><Badge color={ISSUE_STATUS_COLORS[issue.status]}>{ISSUE_STATUS_LABELS[issue.status]}</Badge></td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {issue.status === 'planned' && (
                            <button onClick={() => handleStatusChange(issue.id, 'confirmed')} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="Подтвердить">
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          {issue.status === 'confirmed' && (
                            <button onClick={() => handleStatusChange(issue.id, 'planned')} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" title="Вернуть в запланировано">
                              <Clock className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => setDetailModalOpen(issue.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Детали">
                            <Layers className="w-4 h-4" />
                          </button>
                          <button onClick={() => openEdit(issue.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(issue.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </>
      )}

      {/* Create/edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать выдачу' : 'Новая выдача'} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Подрядчик</label>
              <Select value={form.contractor_id} onChange={(v) => setForm({ ...form, contractor_id: v })} options={data.contractors.map((c) => ({ value: c.id, label: c.name }))} placeholder="Выбрать..." />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Дата выдачи</label>
              <Input type="date" value={form.issue_date} onChange={(v) => setForm({ ...form, issue_date: v })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Статус</label>
              <Select value={form.status} onChange={(v) => setForm({ ...form, status: v as WarehouseIssueStatus })}
                options={[{ value: 'planned', label: 'Запланировано' }, { value: 'confirmed', label: 'Подтверждено' }, { value: 'cancelled', label: 'Отменено' }]} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Примечание</label>
              <Input value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Доп. информация" />
            </div>
          </div>

          {/* Items — drum-picker table layout */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Материалы по объектам</label>
              <button onClick={addItemRow} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Добавить позицию
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Нет позиций</p>
            ) : (
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const unit = materialMap.get(item.material_id)?.unit || '';
                  const requirement = item.material_id && item.object_id ? getRequirement(item.material_id, item.object_id) : 0;
                  const totalAssigned = item.material_id && item.object_id ? getObjectTotalAssigned(item.material_id, item.object_id) : 0;
                  const prevIssued = item.material_id && item.object_id ? getPrevIssuedForObject(item.material_id, item.object_id) : 0;
                  const totalIssued = prevIssued + totalAssigned;
                  const covered = requirement > 0 ? Math.min(1, totalIssued / requirement) : 0;
                  const isOverfilled = totalIssued > requirement && requirement > 0;
                  const availableDrums = item.material_id ? getAvailableDrums(item.material_id, idx) : [];
                  const isFirstForGroup = idx === 0 || items[idx - 1].material_id !== item.material_id || items[idx - 1].object_id !== item.object_id;
                  const isLastForGroup = idx === items.length - 1 || items[idx + 1].material_id !== item.material_id || items[idx + 1].object_id !== item.object_id;
                  const groupRowCount = items.filter((it) => it.material_id === item.material_id && it.object_id === item.object_id).length;
                  const drumIdx = items.slice(0, idx).filter((it) => it.material_id === item.material_id && it.object_id === item.object_id).length;
                  return (
                    <div key={idx} className={`rounded-xl border ${isFirstForGroup ? 'pt-3' : 'pt-2'} pb-2 px-3 ${isOverfilled ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                      {/* Material + object selectors — only on first row in group */}
                      {isFirstForGroup && (
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wide">Материал</p>
                            <SearchSelect
                              value={item.material_id}
                              onChange={(v) => updateIssueItem(idx, { material_id: v })}
                              options={getIssueMaterialOptions(item.material_id)}
                              placeholder="Материал со склада..."
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 mb-1 font-medium uppercase tracking-wide">Участок / объект</p>
                            {(() => {
                              const opts = getContractorObjectOptions(form.contractor_id, item.material_id);
                              const noContractor = !form.contractor_id;
                              return (
                                <select
                                  value={item.object_id}
                                  onChange={(e) => updateIssueItem(idx, { object_id: e.target.value })}
                                  className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">{noContractor ? 'Сначала выберите подрядчика...' : 'Выбрать участок...'}</option>
                                  {opts.map((o) => (
                                    <option key={o.id} value={o.id} style={{ color: o.closed ? '#94a3b8' : undefined }}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                      {/* Requirement progress bar */}
                      {item.material_id && item.object_id && requirement > 0 && isFirstForGroup && (
                        <div className="mb-2">
                          <div className="flex items-center justify-between text-[11px] mb-0.5">
                            <span className="text-slate-500">
                              Потребность: <span className="font-semibold text-blue-700">{formatQuantity(requirement)} {unit}</span>
                              {prevIssued > 0 && (
                                <span className="ml-2 text-slate-400">· Ранее: <span className="font-medium text-slate-600">{formatQuantity(prevIssued)}</span></span>
                              )}
                            </span>
                            <span className={isOverfilled ? 'text-red-600 font-semibold' : totalIssued >= requirement ? 'text-emerald-600 font-semibold' : 'text-slate-600'}>
                              Итого: {formatQuantity(totalIssued)} / {formatQuantity(requirement)} {unit}
                              {totalIssued >= requirement && !isOverfilled && ' ✓'}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isOverfilled ? 'bg-red-400' : covered >= 1 ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(100, covered * 100)}%` }}
                            />
                          </div>
                          {(() => {
                            const remaining = requirement - totalIssued;
                            if (remaining > 0) return (
                              <p className="text-[10px] text-blue-600 mt-0.5">
                                Остаток: <span className="font-semibold">{formatQuantity(remaining)} {unit}</span>
                              </p>
                            );
                            if (remaining < 0) return (
                              <p className="text-[10px] text-red-600 font-semibold mt-0.5">
                                Превышение: +{formatQuantity(Math.abs(remaining))} {unit} — ожидается возврат на склад
                              </p>
                            );
                            return null;
                          })()}
                        </div>
                      )}
                      {/* Drum row */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-slate-400 mb-0.5">Барабан {groupRowCount > 1 ? `#${drumIdx + 1}` : ''}</p>
                          <select
                            value={item.drum_number}
                            onChange={(e) => updateIssueItem(idx, { drum_number: e.target.value })}
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— выбрать барабан —</option>
                            {availableDrums.map((d) => (
                              <option key={d.drumNumber} value={d.drumNumber}>
                                № {d.drumNumber} — доступно {formatQuantity(d.available)} {unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-24 shrink-0">
                          <p className="text-[10px] text-slate-400 mb-0.5">Км с барабана</p>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={(e) => updateIssueItem(idx, { quantity: e.target.value })}
                            placeholder="0"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {item.drum_number && (() => {
                            const drum = availableDrums.find((d) => d.drumNumber === item.drum_number);
                            return drum ? <p className="text-[10px] text-slate-400 mt-0.5 text-right">макс. {formatQuantity(drum.available)}</p> : null;
                          })()}
                        </div>
                        <div className="flex flex-col gap-1 items-center pt-4">
                          {isLastForGroup && (
                            <button
                              onClick={() => addDrumRowForObject(item.material_id, item.object_id)}
                              title="Добавить ещё барабан на этот участок"
                              className="p-1 rounded-lg hover:bg-blue-50 text-blue-500 border border-blue-200"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => removeItemRow(idx)} className="p-1 text-red-400 hover:bg-red-50 rounded-lg">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detailModalOpen} onClose={() => setDetailModalOpen(null)} title="Состав выдачи" wide>
        {(() => {
          const issueItems = itemsByIssue.get(detailModalOpen || '') || [];
          const issue = data.issues.find((i) => i.id === detailModalOpen);
          if (issueItems.length === 0) return <p className="text-sm text-slate-400 text-center py-4">Позиций нет</p>;
          return (
            <div>
              {issue && (
                <div className="mb-3 text-sm text-slate-500">
                  <div>Подрядчик: <span className="font-medium text-slate-700">{contractorMap.get(issue.contractor_id)?.name}</span> · Дата: {new Date(issue.issue_date).toLocaleDateString('ru-RU')}</div>
                  {(issue.received_by || issue.additional_objects || issue.issue_comment) && (
                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                      {issue.received_by && <div><span className="font-medium text-slate-700">Принял:</span> {issue.received_by}</div>}
                      {issue.additional_objects && <div><span className="font-medium text-slate-700">Другие объекты:</span> {issue.additional_objects}</div>}
                      {issue.issue_comment && <div><span className="font-medium text-slate-700">Комментарий:</span> {issue.issue_comment}</div>}
                    </div>
                  )}
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                    <th className="text-left px-4 py-2.5 font-medium">Артикул</th>
                    <th className="text-left px-4 py-2.5 font-medium">Объект</th>
                    <th className="text-right px-4 py-2.5 font-medium">Кол-во</th>
                    <th className="text-left px-4 py-2.5 font-medium">Барабан №</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {issueItems.map((item) => {
                    const mat = materialMap.get(item.material_id);
                    const obj = objectMap.get(item.object_id);
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">{mat?.name || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{mat?.article || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{obj?.name || '—'}</td>
                        <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">{item.quantity} <span className="text-slate-400 text-xs font-normal">{mat?.unit}</span></td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{item.drum_number || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Modal>

      {/* Stock table modal — "Выдать по таблице" */}
      <Modal open={stockModalOpen} onClose={() => { setStockModalOpen(false); setStockSearch(''); }} title="Выдать материалы со склада" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Ниже — материалы, доступные на складе. Найдите нужный материал, нажмите «Выдать», выберите подрядчика и введите количество по каждому объекту.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={stockSearch}
              onChange={(e) => setStockSearch(e.target.value)}
              placeholder="Поиск материала или артикула..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {visibleStockMaterials.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">
              {stockMaterials.length === 0 ? 'Нет доступных материалов на складе' : 'Материал не найден'}
            </p>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-medium">Материал</th>
                    <th className="text-right px-3 py-2 font-medium">Получено</th>
                    <th className="text-right px-3 py-2 font-medium">Выдано</th>
                    <th className="text-right px-3 py-2 font-medium">На проверке</th>
                    <th className="text-right px-3 py-2 font-medium">Доступно</th>
                    <th className="text-center px-3 py-2 font-medium">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleStockMaterials.map((d) => (
                    <tr key={d.material.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-800 font-medium">{d.material.name}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{d.received}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{d.issued}</td>
                      <td className="px-3 py-2 text-right text-amber-600 font-semibold">{d.inspectionBlocked || 0}</td>
                      <td className="px-3 py-2 text-right text-green-600 font-semibold">{d.available}</td>
                      <td className="px-3 py-2 text-center">
                        <Button size="sm" onClick={() => openIssueModal(d.material.id)}>
                          <Truck className="w-3.5 h-3.5" /> Выдать
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {activeTab === 'other' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-slate-500">Всего записей: {data.otherSiteIssues.length}</p>
            <Button onClick={openOtherCreate}>
              <Plus className="w-4 h-4" /> Новая выдача
            </Button>
          </div>

          <Card>
            <CardHeader title="Выдача на другие участки" subtitle="Свободная форма: участок, ответственный, материалы" />
            {data.otherSiteIssues.length === 0 ? (
              <EmptyState icon={MapPin} message="Выдач нет" />
            ) : (
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                      <th className="text-left px-4 py-2.5 font-medium">Участок</th>
                      <th className="text-left px-4 py-2.5 font-medium">Принял</th>
                      <th className="text-center px-4 py-2.5 font-medium">Позиций</th>
                      <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.otherSiteIssues.map((iss) => (
                      <tr key={iss.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{new Date(iss.issue_date).toLocaleDateString('ru-RU')}</td>
                        <td className="px-4 py-2.5 text-slate-800 font-medium">{iss.site_name}</td>
                        <td className="px-4 py-2.5 text-slate-600">{iss.received_by || '—'}</td>
                        <td className="px-4 py-2.5 text-center text-slate-600">{otherItemsByIssue.get(iss.id)?.length || 0}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setOtherDetailOpen(iss.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Детали">
                              <Layers className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleOtherDelete(iss.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Other-site detail modal */}
          <Modal open={!!otherDetailOpen} onClose={() => setOtherDetailOpen(null)} title="Состав выдачи" wide>
            {(() => {
              const iss = data.otherSiteIssues.find((i) => i.id === otherDetailOpen);
              const items = otherItemsByIssue.get(otherDetailOpen || '') || [];
              if (!iss) return null;
              return (
                <div>
                  <div className="mb-3 text-sm text-slate-500 space-y-1">
                    <div><span className="font-medium text-slate-700">Участок:</span> {iss.site_name}</div>
                    <div><span className="font-medium text-slate-700">Дата:</span> {new Date(iss.issue_date).toLocaleDateString('ru-RU')}</div>
                    {iss.received_by && <div><span className="font-medium text-slate-700">Принял:</span> {iss.received_by}</div>}
                    {iss.notes && <div><span className="font-medium text-slate-700">Примечание:</span> {iss.notes}</div>}
                  </div>
                  {items.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">Позиций нет</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                          <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                          <th className="text-right px-4 py-2.5 font-medium">Кол-во</th>
                          <th className="text-left px-4 py-2.5 font-medium">Ед.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map((it) => (
                          <tr key={it.id}>
                            <td className="px-4 py-2.5 text-slate-800 font-medium">{it.material_name}</td>
                            <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">{it.quantity}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{it.unit || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
          </Modal>

          {/* Other-site create modal */}
          <Modal open={otherModalOpen} onClose={() => setOtherModalOpen(false)} title="Новая выдача на другой участок" wide>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Участок <span className="text-red-500">*</span></label>
                  <Input value={otherForm.site_name} onChange={(v) => setOtherForm({ ...otherForm, site_name: v })} placeholder="Название участка" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Дата</label>
                  <Input type="date" value={otherForm.issue_date} onChange={(v) => setOtherForm({ ...otherForm, issue_date: v })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Кто принял</label>
                  <Input value={otherForm.received_by} onChange={(v) => setOtherForm({ ...otherForm, received_by: v })} placeholder="ФИО ответственного" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Примечание</label>
                  <Input value={otherForm.notes} onChange={(v) => setOtherForm({ ...otherForm, notes: v })} placeholder="Доп. информация" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-slate-700">Материалы <span className="text-red-500">*</span></label>
                  <button onClick={addOtherRow} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Добавить
                  </button>
                </div>
                <div className="space-y-2">
                  {otherItems.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <SearchSelect
                          value={it.material_id}
                          onChange={(v) => {
                            const c = [...otherItems];
                            c[idx].material_id = v;
                            const mat = data.materials.find((m) => m.id === v);
                            if (mat) { c[idx].material_name = mat.name; c[idx].unit = mat.unit || ''; }
                            setOtherItems(c);
                          }}
                          options={data.materials.map((m) => ({ value: m.id, label: `${m.name}${m.article ? ' (' + m.article + ')' : ''}` }))}
                          placeholder="Из справочника..."
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          value={it.material_name}
                          onChange={(e) => { const c = [...otherItems]; c[idx].material_name = e.target.value; setOtherItems(c); }}
                          placeholder="Или введите вручную"
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          value={it.quantity}
                          onChange={(e) => { const c = [...otherItems]; c[idx].quantity = e.target.value; setOtherItems(c); }}
                          placeholder="Кол-во"
                          className="w-full px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-1">
                        <input
                          value={it.unit}
                          onChange={(e) => { const c = [...otherItems]; c[idx].unit = e.target.value; setOtherItems(c); }}
                          placeholder="Ед."
                          className="w-full px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button onClick={() => removeOtherRow(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-2">Можно выбрать материал из справочника или написать название вручную. Единица измерения заполнится автоматически при выборе из справочника.</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => setOtherModalOpen(false)}>Отмена</Button>
                <Button onClick={handleOtherSave} disabled={!otherForm.site_name.trim()}>Сохранить</Button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {/* Per-material issue modal */}
      <Modal open={!!issueMaterialId} onClose={() => setIssueMaterialId(null)} title={`Выдать: ${materialMap.get(issueMaterialId || '')?.name || ''}`} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Подрядчик</label>
              <Select
                value={issueContractor}
                onChange={handleIssueContractorChange}
                options={data.contractors.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Выбрать подрядчика..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Дата выдачи</label>
              <Input type="date" value={issueDate} onChange={setIssueDate} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Другие объекты</label>
              <Input value={issueAdditionalObjects} onChange={setIssueAdditionalObjects} placeholder="Если нет в списке" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Ответственный</label>
              <Input value={issueReceivedBy} onChange={setIssueReceivedBy} placeholder="Кто принял выдачу" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Комментарий</label>
              <Input value={issueComment} onChange={setIssueComment} placeholder="Дополнительные сведения" />
            </div>
          </div>
          <p className="text-sm text-slate-500">
            Введите количество для каждого объекта. Оставьте поле пустым, если по этому объекту ничего не выдаётся.
          </p>
          {issueRows.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Нет потребности по этому материалу — выдача не требуется</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-3 py-2 font-medium">Объект</th>
                  <th className="text-right px-3 py-2 font-medium">Потребность</th>
                  <th className="text-right px-3 py-2 font-medium">Барабан №</th>
                  <th className="text-right px-3 py-2 font-medium">Выдать</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issueRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-slate-700">{objectMap.get(row.object_id)?.name || '—'}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{row.required}</td>
                    <td className="px-3 py-2">
                      <input
                        value={row.drumNumber}
                        onChange={(e) => { const c = [...issueRows]; c[idx].drumNumber = e.target.value; setIssueRows(c); }}
                        placeholder="№ барабана"
                        className="w-28 px-2 py-1.5 rounded-lg border border-slate-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {(() => {
                        const stockAvailable = Math.max(
                          0,
                          (receivedByMaterial.get(issueMaterialId || '') || 0) - (issuedByMaterial.get(issueMaterialId || '') || 0),
                        );
                        const maxAllowed = row.required > 0 ? Math.min(row.required, stockAvailable) : stockAvailable;
                        return (
                          <div className="inline-flex flex-col items-end gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const nextRows = [...issueRows];
                                nextRows[idx].issueQty = String(maxAllowed);
                                setIssueRows(nextRows);
                              }}
                              className="text-[10px] leading-none text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              Макс. {maxAllowed}
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxAllowed}
                              value={row.issueQty}
                              onChange={(e) => {
                                const c = [...issueRows];
                                c[idx].issueQty = e.target.value;
                                setIssueRows(c);
                              }}
                              placeholder="0"
                              className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="flex justify-between items-center pt-2">
            <div className="text-sm text-slate-600">
              Итого к выдаче: <span className="font-semibold text-slate-800">
                {issueRows.reduce((sum, r) => sum + (parseFloat(r.issueQty) || 0), 0)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIssueMaterialId(null)}>Отмена</Button>
              <Button onClick={handleIssueSubmit} disabled={!issueContractor}>Создать выдачу</Button>
            </div>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
