import { useState, useMemo } from 'react';
import { Plus, Truck, Trash2, Edit3, Search, Download, X, CheckCircle, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel } from '@/lib/export';
import { ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS, type WarehouseIssueStatus } from '@/lib/types';

export default function WarehouseIssues() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    contractor_id: '',
    issue_date: '',
    status: 'planned' as WarehouseIssueStatus,
    notes: '',
  });
  const [items, setItems] = useState<{ material_id: string; object_id: string; quantity: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterContractor, setFilterContractor] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [detailModalOpen, setDetailModalOpen] = useState<string | null>(null);

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
    setItems(issueItems.map((it) => ({ material_id: it.material_id, object_id: it.object_id, quantity: String(it.quantity) })));
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
            warehouse_issue_id: issueId, material_id: it.material_id, object_id: it.object_id, quantity: parseFloat(it.quantity),
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

  const addItemRow = () => setItems([...items, { material_id: '', object_id: '', quantity: '' }]);
  const removeItemRow = (idx: number) => setItems(items.filter((_, i) => i !== idx));

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего выдач: {data.issues.length}</p>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Новая выдача
        </Button>
      </div>

      <Card>
        <CardHeader
          title="Выдача со склада подрядчикам"
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
                            <Truck className="w-4 h-4" />
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

          {/* Items — compact table layout */}
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
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select
                        value={item.material_id}
                        onChange={(e) => { const c = [...items]; c[idx].material_id = e.target.value; setItems(c); }}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Материал...</option>
                        {data.materials.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-5">
                      <select
                        value={item.object_id}
                        onChange={(e) => { const c = [...items]; c[idx].object_id = e.target.value; setItems(c); }}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Объект...</option>
                        {data.objects.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => { const c = [...items]; c[idx].quantity = e.target.value; setItems(c); }}
                        placeholder="0"
                        className="w-full px-1.5 py-1.5 rounded-lg border border-slate-300 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button onClick={() => removeItemRow(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
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
                  Подрядчик: <span className="font-medium text-slate-700">{contractorMap.get(issue.contractor_id)?.name}</span> · Дата: {new Date(issue.issue_date).toLocaleDateString('ru-RU')}
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                    <th className="text-left px-4 py-2.5 font-medium">Артикул</th>
                    <th className="text-left px-4 py-2.5 font-medium">Объект</th>
                    <th className="text-right px-4 py-2.5 font-medium">Кол-во</th>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </Modal>
    </PageContainer>
  );
}
