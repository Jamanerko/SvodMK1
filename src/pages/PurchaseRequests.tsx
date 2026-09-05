import { useState, useMemo } from 'react';
import { Plus, FileText, Trash2, Edit3, Search, Download, Layers, X, ShoppingCart } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, SearchSelect, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel } from '@/lib/export';
import {
  PR_STATUS_LABELS, PR_STATUS_COLORS, PR_TYPE_LABELS,
  type PurchaseRequestStatus, type PurchaseRequestType,
} from '@/lib/types';

export default function PurchaseRequests() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    material_id: '',
    total_quantity: '',
    request_type: 'rk' as PurchaseRequestType,
    status: 'draft' as PurchaseRequestStatus,
    request_date: '',
    expected_delivery_date: '',
    actual_delivery_date: '',
    notes: '',
  });
  const [itemBreakdown, setItemBreakdown] = useState<{ object_id: string; quantity: string }[]>([]);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [itemsModalOpen, setItemsModalOpen] = useState<string | null>(null);
  const [prItems, setPrItems] = useState<any[]>([]);
  const [newItemObj, setNewItemObj] = useState('');
  const [newItemQty, setNewItemQty] = useState('');

  // Order modal state
  const [orderMaterialId, setOrderMaterialId] = useState<string | null>(null);
  const [orderRows, setOrderRows] = useState<{ object_id: string; required: number; orderQty: string }[]>([]);

  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const objectMap = useMemo(() => new Map(data.objects.map((o) => [o.id, o])), [data.objects]);

  const enriched = useMemo(() => {
    return data.purchaseRequests.map((pr) => ({ ...pr, material: materialMap.get(pr.material_id) }));
  }, [data.purchaseRequests, materialMap]);

  const filtered = useMemo(() => {
    return enriched.filter((pr) => {
      if (filterStatus && pr.status !== filterStatus) return false;
      if (filterType && pr.request_type !== filterType) return false;
      if (search) {
        const s = search.toLowerCase();
        return (pr.material?.name || '').toLowerCase().includes(s) || (pr.notes || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [enriched, search, filterStatus, filterType]);

  // Required by material per object
  const requiredByMaterial = useMemo(() => {
    const map = new Map<string, { object_id: string; required: number }[]>();
    for (const req of data.requirements) {
      const arr = map.get(req.material_id) || [];
      arr.push({ object_id: req.object_id, required: req.quantity });
      map.set(req.material_id, arr);
    }
    return map;
  }, [data.requirements]);

  // Ordered by material (non-cancelled)
  const orderedByMaterial = useMemo(() => {
    const map = new Map<string, number>();
    for (const pr of data.purchaseRequests) {
      if (pr.status !== 'cancelled') {
        map.set(pr.material_id, (map.get(pr.material_id) || 0) + pr.total_quantity);
      }
    }
    return map;
  }, [data.purchaseRequests]);

  // Materials with deficit (for order table)
  const deficitMaterials = useMemo(() => {
    return data.materials
      .map((m) => {
        const required = requiredByMaterial.get(m.id)?.reduce((sum, r) => sum + r.required, 0) || 0;
        const ordered = orderedByMaterial.get(m.id) || 0;
        return { material: m, required, ordered, deficit: required - ordered };
      })
      .filter((d) => d.deficit > 0.01)
      .sort((a, b) => b.deficit - a.deficit);
  }, [data.materials, requiredByMaterial, orderedByMaterial]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      material_id: '', total_quantity: '', request_type: 'rk', status: 'draft',
      request_date: new Date().toISOString().slice(0, 10), expected_delivery_date: '', actual_delivery_date: '', notes: '',
    });
    setItemBreakdown([]);
    setModalOpen(true);
  };

  const openEdit = async (id: string) => {
    const pr = data.purchaseRequests.find((x) => x.id === id);
    if (!pr) return;
    setEditing(id);
    setForm({
      material_id: pr.material_id,
      total_quantity: String(pr.total_quantity),
      request_type: pr.request_type,
      status: pr.status,
      request_date: pr.request_date,
      expected_delivery_date: pr.expected_delivery_date || '',
      actual_delivery_date: pr.actual_delivery_date || '',
      notes: pr.notes || '',
    });
    const { data: items } = await supabase.from('purchase_request_items').select('*').eq('purchase_request_id', id);
    setItemBreakdown((items || []).map((it: any) => ({ object_id: it.object_id, quantity: String(it.quantity) })));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.material_id || !form.total_quantity) return;
    const payload = {
      material_id: form.material_id,
      total_quantity: parseFloat(form.total_quantity),
      request_type: form.request_type,
      status: form.status,
      request_date: form.request_date,
      expected_delivery_date: form.expected_delivery_date || null,
      actual_delivery_date: form.actual_delivery_date || null,
      notes: form.notes || null,
    };
    let prId = editing;
    if (editing) {
      await supabase.from('purchase_requests').update(payload).eq('id', editing);
    } else {
      const { data: inserted } = await supabase.from('purchase_requests').insert(payload).select().single();
      prId = inserted?.id;
    }
    if (prId && itemBreakdown.length > 0) {
      await supabase.from('purchase_request_items').delete().eq('purchase_request_id', prId);
      const items = itemBreakdown
        .filter((b) => b.object_id && b.quantity)
        .map((b) => ({ purchase_request_id: prId!, object_id: b.object_id, quantity: parseFloat(b.quantity) }));
      if (items.length > 0) await supabase.from('purchase_request_items').insert(items);
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить заявку?')) return;
    await supabase.from('purchase_requests').delete().eq('id', id);
    await refresh();
  };

  const addBreakdownRow = () => setItemBreakdown([...itemBreakdown, { object_id: '', quantity: '' }]);
  const removeBreakdownRow = (idx: number) => setItemBreakdown(itemBreakdown.filter((_, i) => i !== idx));

  const openItems = async (prId: string) => {
    const { data: items } = await supabase.from('purchase_request_items').select('*').eq('purchase_request_id', prId);
    setPrItems(items || []);
    setItemsModalOpen(prId);
    setNewItemObj('');
    setNewItemQty('');
  };

  const handleAddItem = async (prId: string) => {
    if (!newItemObj || !newItemQty) return;
    await supabase.from('purchase_request_items').insert({
      purchase_request_id: prId, object_id: newItemObj, quantity: parseFloat(newItemQty),
    });
    setNewItemObj('');
    setNewItemQty('');
    const { data: items } = await supabase.from('purchase_request_items').select('*').eq('purchase_request_id', prId);
    setPrItems(items || []);
    await refresh();
  };

  const handleRemoveItem = async (itemId: string, prId: string) => {
    await supabase.from('purchase_request_items').delete().eq('id', itemId);
    const { data: items } = await supabase.from('purchase_request_items').select('*').eq('purchase_request_id', prId);
    setPrItems(items || []);
    await refresh();
  };

  // Order modal: open for a material, show breakdown by object
  const openOrderModal = (materialId: string) => {
    setOrderMaterialId(materialId);
    const reqs = requiredByMaterial.get(materialId) || [];
    setOrderRows(reqs.map((r) => ({ object_id: r.object_id, required: r.required, orderQty: '' })));
    setOrderModalOpen(true);
  };

  const handleOrderSubmit = async () => {
    if (!orderMaterialId) return;
    const validRows = orderRows.filter((r) => r.orderQty && parseFloat(r.orderQty) > 0);
    if (validRows.length === 0) return;
    const totalQty = validRows.reduce((sum, r) => sum + parseFloat(r.orderQty), 0);
    const mat = materialMap.get(orderMaterialId);
    const { data: inserted } = await supabase.from('purchase_requests').insert({
      material_id: orderMaterialId,
      total_quantity: totalQty,
      request_type: 'rk',
      status: 'draft',
      request_date: new Date().toISOString().slice(0, 10),
      notes: `Заказано: ${mat?.name}`,
    }).select().single();
    if (inserted) {
      await supabase.from('purchase_request_items').insert(
        validRows.map((r) => ({
          purchase_request_id: inserted.id,
          object_id: r.object_id,
          quantity: parseFloat(r.orderQty),
        })),
      );
    }
    setOrderModalOpen(false);
    await refresh();
  };

  const handleExport = () => {
    const rows = filtered.map((pr) => ({
      'Дата заявки': pr.request_date,
      'Материал': pr.material?.name || '',
      'Артикул': pr.material?.article || '',
      'Кол-во': pr.total_quantity,
      'Тип': PR_TYPE_LABELS[pr.request_type],
      'Статус': PR_STATUS_LABELS[pr.status],
      'Ожидаемая поставка': pr.expected_delivery_date || '',
      'Фактическая поставка': pr.actual_delivery_date || '',
      'Примечание': pr.notes || '',
    }));
    exportToExcel(rows, 'Заявки', 'zayavki');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего заявок: {data.purchaseRequests.length}</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setOrderModalOpen(true)}>
            <ShoppingCart className="w-4 h-4" /> Заказать по таблице
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Новая заявка
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Заявки на закуп"
          subtitle="РК (местное размещение) и РФ (неместное размещение)"
          action={
            <button onClick={handleExport} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Excel
            </button>
          }
        />
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            options={(Object.keys(PR_STATUS_LABELS) as PurchaseRequestStatus[]).map((s) => ({ value: s, label: PR_STATUS_LABELS[s] }))}
            placeholder="Все статусы"
            className="sm:w-44"
          />
          <Select
            value={filterType}
            onChange={setFilterType}
            options={(Object.keys(PR_TYPE_LABELS) as PurchaseRequestType[]).map((t) => ({ value: t, label: PR_TYPE_LABELS[t] }))}
            placeholder="Все типы"
            className="sm:w-44"
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={FileText} message="Заявок нет" />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-right px-4 py-2.5 font-medium">Кол-во</th>
                  <th className="text-left px-4 py-2.5 font-medium">Тип</th>
                  <th className="text-left px-4 py-2.5 font-medium">Статус</th>
                  <th className="text-left px-4 py-2.5 font-medium">Поставка</th>
                  <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((pr) => (
                  <tr key={pr.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(pr.request_date).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{pr.material?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">{pr.total_quantity}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{PR_TYPE_LABELS[pr.request_type]}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={PR_STATUS_COLORS[pr.status]}>{PR_STATUS_LABELS[pr.status]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {pr.actual_delivery_date
                        ? `Получено: ${new Date(pr.actual_delivery_date).toLocaleDateString('ru-RU')}`
                        : pr.expected_delivery_date
                        ? `Ожид.: ${new Date(pr.expected_delivery_date).toLocaleDateString('ru-RU')}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openItems(pr.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Разбивка по объектам">
                          <Layers className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(pr.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(pr.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
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

      {/* Create/edit modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать заявку' : 'Новая заявка на закуп'} wide>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Материал</label>
            <SearchSelect
              value={form.material_id}
              onChange={(v) => setForm({ ...form, material_id: v })}
              options={data.materials.map((m) => ({ value: m.id, label: `${m.name}${m.article ? ' (' + m.article + ')' : ''}` }))}
              placeholder="Выбрать материал..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Количество</label>
              <Input type="number" value={form.total_quantity} onChange={(v) => setForm({ ...form, total_quantity: v })} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Тип заявки</label>
              <Select
                value={form.request_type}
                onChange={(v) => setForm({ ...form, request_type: v as PurchaseRequestType })}
                options={[
                  { value: 'rk', label: 'РК (местное размещение)' },
                  { value: 'rf', label: 'РФ (неместное размещение)' },
                ]}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Статус</label>
              <Select
                value={form.status}
                onChange={(v) => setForm({ ...form, status: v as PurchaseRequestStatus })}
                options={(Object.keys(PR_STATUS_LABELS) as PurchaseRequestStatus[]).map((s) => ({ value: s, label: PR_STATUS_LABELS[s] }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Дата заявки</label>
              <Input type="date" value={form.request_date} onChange={(v) => setForm({ ...form, request_date: v })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Ожидаемая дата поставки</label>
              <Input type="date" value={form.expected_delivery_date} onChange={(v) => setForm({ ...form, expected_delivery_date: v })} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Фактическая дата поставки</label>
              <Input type="date" value={form.actual_delivery_date} onChange={(v) => setForm({ ...form, actual_delivery_date: v })} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Примечание</label>
            <Input value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Доп. информация" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Разбивка по объектам</label>
              <button onClick={addBreakdownRow} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Добавить
              </button>
            </div>
            {itemBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Не указана — заявка без разбивки</p>
            ) : (
              <div className="space-y-2">
                {itemBreakdown.map((item, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Select
                      value={item.object_id}
                      onChange={(v) => { const c = [...itemBreakdown]; c[idx].object_id = v; setItemBreakdown(c); }}
                      options={data.objects.map((o) => ({ value: o.id, label: o.name }))}
                      placeholder="Объект..."
                      className="flex-1"
                    />
                    <Input type="number" value={item.quantity}
                      onChange={(v) => { const c = [...itemBreakdown]; c[idx].quantity = v; setItemBreakdown(c); }}
                      placeholder="Кол-во" className="w-24" />
                    <button onClick={() => removeBreakdownRow(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
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

      {/* Items modal */}
      <Modal open={!!itemsModalOpen} onClose={() => setItemsModalOpen(null)} title="Разбивка заявки по объектам" wide>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Select value={newItemObj} onChange={setNewItemObj}
              options={data.objects.filter((o) => !prItems.some((i) => i.object_id === o.id)).map((o) => ({ value: o.id, label: o.name }))}
              placeholder="Объект..." className="flex-1" />
            <Input type="number" value={newItemQty} onChange={setNewItemQty} placeholder="Кол-во" className="w-28" />
            <Button onClick={() => itemsModalOpen && handleAddItem(itemsModalOpen)} disabled={!newItemObj || !newItemQty}>
              <Plus className="w-4 h-4" /> Добавить
            </Button>
          </div>
          {prItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Разбивки нет</p>
          ) : (
            <div className="space-y-1">
              {prItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50">
                  <span className="text-sm text-slate-700">{objectMap.get(item.object_id)?.name || '—'}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800">{item.quantity}</span>
                    <button onClick={() => handleRemoveItem(item.id, itemsModalOpen!)} className="text-red-500 hover:text-red-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Order modal — table-based ordering */}
      <Modal open={orderModalOpen} onClose={() => setOrderModalOpen(false)} title="Заказать материалы" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Ниже — материалы с дефицитом. Нажмите «Заказать» у нужного материала, введите количество по каждому объекту (можно заказать часть потребности).
          </p>
          {deficitMaterials.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Дефицитов нет — всё заказано</p>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                    <th className="text-left px-3 py-2 font-medium">Материал</th>
                    <th className="text-right px-3 py-2 font-medium">Потребность</th>
                    <th className="text-right px-3 py-2 font-medium">Заказано</th>
                    <th className="text-right px-3 py-2 font-medium">Дефицит</th>
                    <th className="text-center px-3 py-2 font-medium">Действие</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deficitMaterials.map((d) => (
                    <tr key={d.material.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-800 font-medium">{d.material.name}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{d.required}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{d.ordered}</td>
                      <td className="px-3 py-2 text-right text-red-600 font-semibold">{d.deficit}</td>
                      <td className="px-3 py-2 text-center">
                        <Button size="sm" onClick={() => openOrderModal(d.material.id)}>
                          <ShoppingCart className="w-3.5 h-3.5" /> Заказать
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

      {/* Per-object order modal */}
      <Modal open={!!orderMaterialId} onClose={() => setOrderMaterialId(null)} title={`Заказать: ${materialMap.get(orderMaterialId || '')?.name || ''}`} wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Введите количество для каждого объекта. Можно заказать часть потребности (например, 30%). Оставьте поле пустым, если по этому объекту не заказываете.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <th className="text-left px-3 py-2 font-medium">Объект</th>
                <th className="text-right px-3 py-2 font-medium">Потребность</th>
                <th className="text-right px-3 py-2 font-medium">Заказать</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orderRows.map((row, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-slate-700">{objectMap.get(row.object_id)?.name || '—'}</td>
                  <td className="px-3 py-2 text-right text-slate-600">{row.required}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={row.orderQty}
                      onChange={(e) => {
                        const c = [...orderRows];
                        c[idx].orderQty = e.target.value;
                        setOrderRows(c);
                      }}
                      placeholder="0"
                      className="w-24 px-2 py-1.5 rounded-lg border border-slate-300 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center pt-2">
            <div className="text-sm text-slate-600">
              Итого к заказу: <span className="font-semibold text-slate-800">
                {orderRows.reduce((sum, r) => sum + (parseFloat(r.orderQty) || 0), 0)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOrderMaterialId(null)}>Отмена</Button>
              <Button onClick={handleOrderSubmit}>Создать заявку</Button>
            </div>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
