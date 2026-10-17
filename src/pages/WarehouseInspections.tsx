import { useMemo, useState } from 'react';
import { ClipboardCheck, Download, Edit3, Plus, Search, Trash2, X, CheckCircle, Ban } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import {
  Card,
  CardHeader,
  Button,
  Input,
  Select,
  SearchSelect,
  Modal,
  Badge,
  PageContainer,
  LoadingSpinner,
  EmptyState,
} from '@/components/ui';
import { exportToExcel } from '@/lib/export';
import { getWarehouseInboundByMaterial } from '@/lib/warehouse';
import {
  INSPECTION_STATUS_COLORS,
  INSPECTION_STATUS_LABELS,
  type WarehouseInspectionStatus,
} from '@/lib/types';

interface InspectionRow {
  material_id: string;
  transferred_quantity: string;
}

interface InspectionResultRow {
  id: string;
  material_id: string;
  transferred_quantity: number;
  inspected_quantity: string;
  defective_quantity: string;
}

export default function WarehouseInspections() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState({
    inspection_date: new Date().toISOString().slice(0, 10),
    destination: '',
    status: 'in_review' as WarehouseInspectionStatus,
    notes: '',
  });
  const [rows, setRows] = useState<InspectionRow[]>([]);
  const [resultInspectionId, setResultInspectionId] = useState<string | null>(null);
  const [resultRows, setResultRows] = useState<InspectionResultRow[]>([]);

  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const inspectionMap = useMemo(() => new Map(data.inspections.map((inspection) => [inspection.id, inspection])), [data.inspections]);
  const itemsByInspection = useMemo(() => {
    const map = new Map<string, typeof data.inspectionItems>();
    for (const item of data.inspectionItems) {
      const current = map.get(item.inspection_id) || [];
      current.push(item);
      map.set(item.inspection_id, current);
    }
    return map;
  }, [data.inspectionItems]);

  const issuedByMaterial = useMemo(() => {
    const activeIssueIds = new Set(data.issues.filter((issue) => issue.status !== 'cancelled').map((issue) => issue.id));
    const map = new Map<string, number>();
    for (const item of data.issueItems) {
      if (activeIssueIds.has(item.warehouse_issue_id)) {
        map.set(item.material_id, (map.get(item.material_id) || 0) + item.quantity);
      }
    }
    return map;
  }, [data.issues, data.issueItems]);

  const inspectionBlockedByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data.inspectionItems) {
      const inspection = inspectionMap.get(item.inspection_id);
      if (!inspection || inspection.status === 'cancelled') continue;
      const blocked = inspection.status === 'in_review' ? item.transferred_quantity : item.defective_quantity;
      map.set(item.material_id, (map.get(item.material_id) || 0) + blocked);
    }
    return map;
  }, [data.inspectionItems, inspectionMap]);

  const receivedByMaterial = useMemo(
    () => getWarehouseInboundByMaterial(data.receipts, data.purchaseRequests),
    [data.receipts, data.purchaseRequests],
  );

  const stockAvailable = useMemo(() => {
    const map = new Map<string, number>();
    for (const material of data.materials) {
      const received = receivedByMaterial.get(material.id) || 0;
      const issued = issuedByMaterial.get(material.id) || 0;
      const blocked = inspectionBlockedByMaterial.get(material.id) || 0;
      map.set(material.id, received - issued - blocked);
    }
    return map;
  }, [data.materials, receivedByMaterial, issuedByMaterial, inspectionBlockedByMaterial]);

  const formAvailable = (materialId: string) => {
    let available = stockAvailable.get(materialId) || 0;
    if (editing) {
      for (const item of itemsByInspection.get(editing) || []) {
        if (item.material_id !== materialId) continue;
        const inspection = inspectionMap.get(editing);
        available += inspection?.status === 'in_review' ? item.transferred_quantity : item.defective_quantity;
      }
    }
    return available;
  };

  const filteredInspections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.inspections.filter((inspection) => {
      if (filterStatus && inspection.status !== filterStatus) return false;
      if (!query) return true;
      const materials = (itemsByInspection.get(inspection.id) || [])
        .map((item) => materialMap.get(item.material_id)?.name || '')
        .join(' ');
      return `${inspection.destination} ${inspection.notes || ''} ${materials}`.toLowerCase().includes(query);
    });
  }, [data.inspections, filterStatus, search, itemsByInspection, materialMap]);

  const openCreate = () => {
    setEditing(null);
    setForm({ inspection_date: new Date().toISOString().slice(0, 10), destination: '', status: 'in_review', notes: '' });
    setRows([{ material_id: '', transferred_quantity: '' }]);
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    const inspection = inspectionMap.get(id);
    if (!inspection) return;
    setEditing(id);
    setForm({
      inspection_date: inspection.inspection_date,
      destination: inspection.destination,
      status: inspection.status,
      notes: inspection.notes || '',
    });
    setRows((itemsByInspection.get(id) || []).map((item) => ({
      material_id: item.material_id,
      transferred_quantity: String(item.transferred_quantity),
    })));
    setModalOpen(true);
  };

  const updateRow = (index: number, field: keyof InspectionRow, value: string) => {
    const next = [...rows];
    next[index] = { ...next[index], [field]: value };
    setRows(next);
  };

  const handleSave = async () => {
    if (!form.destination.trim()) return;
    const validRows = rows.filter((row) => row.material_id && parseFloat(row.transferred_quantity) > 0);
    if (validRows.length === 0) return;

    for (const row of validRows) {
      const transferred = parseFloat(row.transferred_quantity);
      if (transferred > formAvailable(row.material_id) + 0.01) return;
    }
    const payload = {
      inspection_date: form.inspection_date,
      destination: form.destination.trim(),
      status: form.status,
      notes: form.notes.trim() || null,
    };
    let inspectionId = editing;
    if (editing) {
      await supabase.from('warehouse_inspections').update(payload).eq('id', editing);
      await supabase.from('warehouse_inspection_items').delete().eq('inspection_id', editing);
    } else {
      const { data: inserted } = await supabase.from('warehouse_inspections').insert(payload).select().maybeSingle();
      inspectionId = inserted?.id || null;
    }
    if (inspectionId) {
      const existingItems = new Map((editing ? itemsByInspection.get(editing) || [] : []).map((item) => [item.material_id, item]));
      await supabase.from('warehouse_inspection_items').insert(validRows.map((row) => {
        const existing = existingItems.get(row.material_id);
        return {
          inspection_id: inspectionId,
          material_id: row.material_id,
          transferred_quantity: parseFloat(row.transferred_quantity),
          inspected_quantity: existing?.inspected_quantity || 0,
          defective_quantity: existing?.defective_quantity || 0,
        };
      }));
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить запись проверки?')) return;
    await supabase.from('warehouse_inspections').delete().eq('id', id);
    await refresh();
  };

  const openResult = (id: string) => {
    setResultInspectionId(id);
    setResultRows((itemsByInspection.get(id) || []).map((item) => ({
      id: item.id,
      material_id: item.material_id,
      transferred_quantity: item.transferred_quantity,
      inspected_quantity: String(item.inspected_quantity),
      defective_quantity: String(item.defective_quantity),
    })));
  };

  const updateResultRow = (index: number, field: 'inspected_quantity' | 'defective_quantity', value: string) => {
    const next = [...resultRows];
    next[index] = { ...next[index], [field]: value };
    setResultRows(next);
  };

  const saveResult = async () => {
    if (!resultInspectionId || resultRows.length === 0) return;
    if (resultRows.some((row) => {
      const inspected = parseFloat(row.inspected_quantity) || 0;
      const defective = parseFloat(row.defective_quantity) || 0;
      return inspected > row.transferred_quantity || defective > inspected;
    })) return;
    for (const row of resultRows) {
      await supabase.from('warehouse_inspection_items').update({
        inspected_quantity: parseFloat(row.inspected_quantity) || 0,
        defective_quantity: parseFloat(row.defective_quantity) || 0,
      }).eq('id', row.id);
    }
    await supabase.from('warehouse_inspections').update({ status: 'completed' }).eq('id', resultInspectionId);
    setResultInspectionId(null);
    await refresh();
  };

  const changeStatus = async (id: string, status: WarehouseInspectionStatus) => {
    await supabase.from('warehouse_inspections').update({ status }).eq('id', id);
    await refresh();
  };

  const handleExport = () => {
    const exportRows: Record<string, string | number>[] = [];
    for (const inspection of filteredInspections) {
      for (const item of itemsByInspection.get(inspection.id) || []) {
        const material = materialMap.get(item.material_id);
        exportRows.push({
          Дата: inspection.inspection_date,
          Материал: material?.name || '',
          'Кол-во передано': item.transferred_quantity,
          'Кол-во проверено': item.inspected_quantity,
          'Кол-во брака': item.defective_quantity,
          'Куда передано': inspection.destination,
          Статус: INSPECTION_STATUS_LABELS[inspection.status],
        });
      }
    }
    exportToExcel(exportRows, 'Проверка', 'proverka');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего проверок: {data.inspections.length}</p>
        <Button onClick={openCreate}><Plus className="w-4 h-4" /> Передать на проверку</Button>
      </div>

      <Card>
        <CardHeader
          title="Проверка материалов"
          subtitle="Переданные материалы временно недоступны для выдачи подрядчикам"
          action={<button onClick={handleExport} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Excel</button>}
        />
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по материалу или организации..." className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <Select value={filterStatus} onChange={setFilterStatus} options={(Object.keys(INSPECTION_STATUS_LABELS) as WarehouseInspectionStatus[]).map((status) => ({ value: status, label: INSPECTION_STATUS_LABELS[status] }))} placeholder="Все статусы" className="sm:w-44" />
        </div>
        {filteredInspections.length === 0 ? (
          <EmptyState icon={ClipboardCheck} message="Проверок нет" />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-right px-4 py-2.5 font-medium">Передано</th>
                  <th className="text-right px-4 py-2.5 font-medium">Проверено</th>
                  <th className="text-right px-4 py-2.5 font-medium">Брак</th>
                  <th className="text-left px-4 py-2.5 font-medium">Куда передано</th>
                  <th className="text-left px-4 py-2.5 font-medium">Статус</th>
                  <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInspections.flatMap((inspection) => {
                  const items = itemsByInspection.get(inspection.id) || [];
                  return (items.length ? items : [{ id: `${inspection.id}-empty`, material_id: '', transferred_quantity: 0, inspected_quantity: 0, defective_quantity: 0 }]).map((item, index) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">{index === 0 ? new Date(inspection.inspection_date).toLocaleDateString('ru-RU') : ''}</td>
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{materialMap.get(item.material_id)?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-800">{item.transferred_quantity || '—'} <span className="text-xs text-slate-400">{materialMap.get(item.material_id)?.unit}</span></td>
                      <td className="px-4 py-2.5 text-right text-slate-700">{item.inspected_quantity || 0}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-red-600">{item.defective_quantity || 0}</td>
                      <td className="px-4 py-2.5 text-slate-600">{index === 0 ? inspection.destination : ''}</td>
                      <td className="px-4 py-2.5">{index === 0 && <Badge color={INSPECTION_STATUS_COLORS[inspection.status]}>{INSPECTION_STATUS_LABELS[inspection.status]}</Badge>}</td>
                      <td className="px-4 py-2.5 text-right">
                        {index === 0 && <div className="flex justify-end gap-1">
                          {inspection.status !== 'cancelled' && <button onClick={() => openResult(inspection.id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title={inspection.status === 'completed' ? 'Изменить результат проверки' : 'Внести результат проверки'}><CheckCircle className="w-4 h-4" /></button>}
                          {inspection.status === 'in_review' && <button onClick={() => changeStatus(inspection.id, 'cancelled')} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Отменить"><Ban className="w-4 h-4" /></button>}
                          <button onClick={() => openEdit(inspection.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Изменить"><Edit3 className="w-4 h-4" /></button>
                          <button onClick={() => handleDelete(inspection.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Удалить"><Trash2 className="w-4 h-4" /></button>
                        </div>}
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать проверку' : 'Передать материалы на проверку'} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-slate-700 mb-1 block">Дата передачи</label><Input type="date" value={form.inspection_date} onChange={(value) => setForm({ ...form, inspection_date: value })} /></div>
            <div><label className="text-sm font-medium text-slate-700 mb-1 block">Куда передано</label><Input value={form.destination} onChange={(value) => setForm({ ...form, destination: value })} placeholder="Организация проверки" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm font-medium text-slate-700 mb-1 block">Статус</label><Select value={form.status} onChange={(value) => setForm({ ...form, status: value as WarehouseInspectionStatus })} options={(Object.keys(INSPECTION_STATUS_LABELS) as WarehouseInspectionStatus[]).filter((status) => status !== 'completed' || editing).map((status) => ({ value: status, label: INSPECTION_STATUS_LABELS[status] }))} /></div>
            <div><label className="text-sm font-medium text-slate-700 mb-1 block">Примечание</label><Input value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} placeholder="Доп. информация" /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2"><label className="text-sm font-medium text-slate-700">Материалы</label><button onClick={() => setRows([...rows, { material_id: '', transferred_quantity: '' }])} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Добавить позицию</button></div>
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_11rem_auto] gap-2 items-center">
                  <SearchSelect value={row.material_id} onChange={(value) => updateRow(index, 'material_id', value)} options={data.materials.filter((material) => formAvailable(material.id) > 0 || material.id === row.material_id).map((material) => ({ value: material.id, label: `${material.name}${material.article ? ` (${material.article})` : ''}`, meta: `доступно: ${formAvailable(material.id)} ${material.unit}` }))} placeholder="Материал..." renderOption={(option) => <span className="flex justify-between gap-3"><span className="truncate">{option.label}</span><span className="text-slate-500 shrink-0">{option.meta}</span></span>} />
                  <div>
                    <div className="flex gap-1.5">
                      <Input type="number" value={row.transferred_quantity} onChange={(value) => updateRow(index, 'transferred_quantity', value)} placeholder="Количество" />
                      <button type="button" onClick={() => updateRow(index, 'transferred_quantity', String(Math.max(0, formAvailable(row.material_id))))} disabled={!row.material_id || formAvailable(row.material_id) <= 0} className="px-2 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed">Всё</button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">На складе: {row.material_id ? `${formAvailable(row.material_id)} ${materialMap.get(row.material_id)?.unit || ''}` : '—'}</p>
                  </div>
                  <button onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">Материалы со статусом «На проверке» временно не входят в доступный остаток склада. После получения результата внесите проверенное количество и брак отдельной кнопкой в журнале.</p>
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button><Button onClick={handleSave}>Сохранить</Button></div>
        </div>
      </Modal>

      <Modal open={!!resultInspectionId} onClose={() => setResultInspectionId(null)} title="Результат проверки" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Укажите результаты по переданным материалам. Проверенное количество не может быть больше переданного, а брак — больше проверенного.</p>
          <div className="space-y-2">
            {resultRows.map((row, index) => (
              <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_8rem_8rem] gap-2 items-end">
                <div><p className="text-sm font-medium text-slate-700 truncate">{materialMap.get(row.material_id)?.name || 'Материал'}</p><p className="text-xs text-slate-400">Передано: {row.transferred_quantity} {materialMap.get(row.material_id)?.unit || ''}</p></div>
                <Input type="number" value={row.inspected_quantity} onChange={(value) => updateResultRow(index, 'inspected_quantity', value)} placeholder="Проверено" />
                <Input type="number" value={row.defective_quantity} onChange={(value) => updateResultRow(index, 'defective_quantity', value)} placeholder="Брак" />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setResultInspectionId(null)}>Отмена</Button><Button onClick={saveResult}>Сохранить результат</Button></div>
        </div>
      </Modal>
    </PageContainer>
  );
}
