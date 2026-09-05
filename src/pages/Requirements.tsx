import { useState, useMemo } from 'react';
import { Plus, ClipboardList, Trash2, Edit3, Search, Download, History, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, SearchSelect, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel, exportToPDF } from '@/lib/export';
import { OBJECT_TYPE_LABELS } from '@/lib/types';

export default function Requirements() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [form, setForm] = useState({ material_id: '', object_id: '', quantity: '' });
  const [editForm, setEditForm] = useState({ id: '', quantity: '', reason: '' });
  const [search, setSearch] = useState('');
  const [filterObject, setFilterObject] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');

  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const objectMap = useMemo(() => new Map(data.objects.map((o) => [o.id, o])), [data.objects]);

  const enriched = useMemo(() => {
    return data.requirements.map((r) => ({
      ...r,
      material: materialMap.get(r.material_id),
      object: objectMap.get(r.object_id),
    }));
  }, [data.requirements, materialMap, objectMap]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (filterObject && r.object_id !== filterObject) return false;
      if (filterMaterial && r.material_id !== filterMaterial) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          r.material?.name.toLowerCase().includes(s) ||
          r.object?.name.toLowerCase().includes(s) ||
          (r.material?.article || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [enriched, search, filterObject, filterMaterial]);

  const openCreate = () => {
    setForm({ material_id: '', object_id: '', quantity: '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.material_id || !form.object_id || !form.quantity) return;
    const qty = parseFloat(form.quantity);
    if (isNaN(qty)) return;

    // Check if requirement already exists
    const existing = data.requirements.find(
      (r) => r.material_id === form.material_id && r.object_id === form.object_id,
    );
    if (existing) {
      // Update existing and log correction
      await supabase.from('requirements').update({ quantity: qty }).eq('id', existing.id);
      await supabase.from('requirement_corrections').insert({
        requirement_id: existing.id,
        material_id: form.material_id,
        object_id: form.object_id,
        old_quantity: existing.quantity,
        new_quantity: qty,
        reason: 'Новое значение при добавлении',
        changed_by: 'operator',
      });
    } else {
      const { data: inserted } = await supabase
        .from('requirements')
        .insert({
          material_id: form.material_id,
          object_id: form.object_id,
          quantity: qty,
        })
        .select()
        .single();
      if (inserted) {
        await supabase.from('requirement_corrections').insert({
          requirement_id: inserted.id,
          material_id: form.material_id,
          object_id: form.object_id,
          old_quantity: 0,
          new_quantity: qty,
          reason: 'Первоначальное внесение',
          changed_by: 'operator',
        });
      }
    }
    setModalOpen(false);
    await refresh();
  };

  const openEdit = (req: any) => {
    setEditForm({ id: req.id, quantity: String(req.quantity), reason: '' });
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    const qty = parseFloat(editForm.quantity);
    if (isNaN(qty)) return;
    const req = data.requirements.find((r) => r.id === editForm.id);
    if (!req) return;

    await supabase.from('requirements').update({ quantity: qty }).eq('id', editForm.id);
    await supabase.from('requirement_corrections').insert({
      requirement_id: editForm.id,
      material_id: req.material_id,
      object_id: req.object_id,
      old_quantity: req.quantity,
      new_quantity: qty,
      reason: editForm.reason || 'Корректировка',
      changed_by: 'operator',
    });
    setEditModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить потребность?')) return;
    const req = data.requirements.find((r) => r.id === id);
    if (req) {
      await supabase.from('requirement_corrections').insert({
        requirement_id: id,
        material_id: req.material_id,
        object_id: req.object_id,
        old_quantity: req.quantity,
        new_quantity: 0,
        reason: 'Удаление потребности',
        changed_by: 'operator',
      });
    }
    await supabase.from('requirements').delete().eq('id', id);
    await refresh();
  };

  const openHistory = async (reqId: string) => {
    const { data: corr } = await supabase
      .from('requirement_corrections')
      .select('*')
      .eq('requirement_id', reqId)
      .order('changed_at', { ascending: false });
    setCorrections(corr || []);
    setHistoryModalOpen(reqId);
  };

  const handleExport = () => {
    const rows = filtered.map((r) => ({
      'Материал': r.material?.name || '',
      'Артикул': r.material?.article || '',
      'Ед. изм.': r.material?.unit || '',
      'Объект': r.object?.name || '',
      'Тип объекта': r.object ? OBJECT_TYPE_LABELS[r.object.type] : '',
      'Количество': r.quantity,
    }));
    exportToExcel(rows, 'Потребность', 'potrebnost');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего записей: {data.requirements.length}</p>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Добавить потребность
        </Button>
      </div>

      <Card>
        <CardHeader
          title="Потребность в материалах"
          subtitle="Сколько материала заложено по проекту на каждый объект"
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
            value={filterObject}
            onChange={setFilterObject}
            options={data.objects.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Все объекты"
            className="sm:w-48"
          />
          <Select
            value={filterMaterial}
            onChange={setFilterMaterial}
            options={data.materials.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="Все материалы"
            className="sm:w-48"
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} message="Потребность не добавлена" />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-left px-4 py-2.5 font-medium">Артикул</th>
                  <th className="text-left px-4 py-2.5 font-medium">Объект</th>
                  <th className="text-right px-4 py-2.5 font-medium">Кол-во</th>
                  <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{r.material?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{r.material?.article || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.object?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">{r.quantity.toLocaleString('ru-RU')}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openHistory(r.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="История корректировок">
                          <History className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(r)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
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

      {/* Create modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новая потребность">
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
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Объект</label>
            <Select
              value={form.object_id}
              onChange={(v) => setForm({ ...form, object_id: v })}
              options={data.objects.map((o) => ({ value: o.id, label: o.name }))}
              placeholder="Выбрать..."
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Количество</label>
            <Input type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} placeholder="0" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title="Корректировка потребности">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Изменение количества будет зафиксировано в истории корректировок с указанием старого и нового значения, даты и причины.
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Новое количество</label>
            <Input type="number" value={editForm.quantity} onChange={(v) => setEditForm({ ...editForm, quantity: v })} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Причина корректировки</label>
            <Input value={editForm.reason} onChange={(v) => setEditForm({ ...editForm, reason: v })} placeholder="Напр. Изменение проекта, замена материала..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditModalOpen(false)}>Отмена</Button>
            <Button onClick={handleEditSave}>Сохранить с фиксацией</Button>
          </div>
        </div>
      </Modal>

      {/* History modal */}
      <Modal open={!!historyModalOpen} onClose={() => setHistoryModalOpen(null)} title="История корректировок" wide>
        {corrections.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Корректировок не было</p>
        ) : (
          <div className="space-y-2">
            {corrections.map((c) => {
              const mat = materialMap.get(c.material_id);
              const obj = objectMap.get(c.object_id);
              return (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 line-through">{c.old_quantity}</span>
                    <span className="text-slate-400">→</span>
                    <span className="text-slate-800 font-semibold">{c.new_quantity}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700">{mat?.name} · {obj?.name}</div>
                    <div className="text-xs text-slate-400">
                      {c.reason || 'Без указания причины'} · {c.changed_by} ·{' '}
                      {new Date(c.changed_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </PageContainer>
  );
}
