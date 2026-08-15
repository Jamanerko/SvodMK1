import { useState, useMemo } from 'react';
import { Plus, Warehouse, Trash2, Edit3, Search, Download, X, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, Modal, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel } from '@/lib/export';

interface ReceiptRow {
  material_id: string;
  quantity: string;
}

export default function WarehouseReceipts() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ receipt_date: '', supplier: '', document_url: '', notes: '' });
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [search, setSearch] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');

  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);

  const enriched = useMemo(() => {
    return data.receipts.map((r) => ({ ...r, material: materialMap.get(r.material_id) }));
  }, [data.receipts, materialMap]);

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (filterMaterial && r.material_id !== filterMaterial) return false;
      if (search) {
        const s = search.toLowerCase();
        return (r.material?.name || '').toLowerCase().includes(s) || (r.supplier || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [enriched, search, filterMaterial]);

  const openCreate = () => {
    setEditing(null);
    setForm({ receipt_date: new Date().toISOString().slice(0, 10), supplier: '', document_url: '', notes: '' });
    setRows([{ material_id: '', quantity: '' }]);
    setMaterialSearch('');
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    const r = data.receipts.find((x) => x.id === id);
    if (!r) return;
    setEditing(id);
    setForm({
      receipt_date: r.receipt_date,
      supplier: r.supplier || '',
      document_url: r.document_url || '',
      notes: r.notes || '',
    });
    setRows([{ material_id: r.material_id, quantity: String(r.quantity) }]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (editing) {
      const row = rows[0];
      if (!row.material_id || !row.quantity) return;
      await supabase.from('warehouse_receipts').update({
        material_id: row.material_id,
        quantity: parseFloat(row.quantity),
        receipt_date: form.receipt_date,
        supplier: form.supplier || null,
        document_url: form.document_url || null,
        notes: form.notes || null,
      }).eq('id', editing);
    } else {
      const validRows = rows.filter((r) => r.material_id && r.quantity);
      if (validRows.length === 0) return;
      const inserts = validRows.map((r) => ({
        material_id: r.material_id,
        quantity: parseFloat(r.quantity),
        receipt_date: form.receipt_date || new Date().toISOString().slice(0, 10),
        supplier: form.supplier || null,
        document_url: form.document_url || null,
        notes: form.notes || null,
      }));
      await supabase.from('warehouse_receipts').insert(inserts);
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить приход?')) return;
    await supabase.from('warehouse_receipts').delete().eq('id', id);
    await refresh();
  };

  const addRow = () => setRows([...rows, { material_id: '', quantity: '' }]);
  const removeRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));

  const updateRow = (idx: number, field: keyof ReceiptRow, value: string) => {
    const copy = [...rows];
    (copy[idx] as any)[field] = value;
    setRows(copy);
  };

  const handleExport = () => {
    const rows = filtered.map((r) => ({
      'Дата': r.receipt_date,
      'Материал': r.material?.name || '',
      'Артикул': r.material?.article || '',
      'Ед. изм.': r.material?.unit || '',
      'Количество': r.quantity,
      'Поставщик': r.supplier || '',
      'Документ': r.document_url || '',
      'Примечание': r.notes || '',
    }));
    exportToExcel(rows, 'Приход', 'prihod');
  };

  // Filter materials for dropdown search
  const filteredMaterials = useMemo(() => {
    if (!materialSearch) return data.materials;
    const s = materialSearch.toLowerCase();
    return data.materials.filter((m) =>
      m.name.toLowerCase().includes(s) || (m.article || '').toLowerCase().includes(s),
    );
  }, [data.materials, materialSearch]);

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего приходов: {data.receipts.length}</p>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Добавить приход
        </Button>
      </div>

      <Card>
        <CardHeader
          title="Приход на склад (г. Каражал)"
          subtitle="Поступление материалов от поставщиков"
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
              placeholder="Поиск по материалу, поставщику..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select
            value={filterMaterial}
            onChange={setFilterMaterial}
            options={data.materials.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="Все материалы"
            className="sm:w-56"
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Warehouse} message="Приходов нет" />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-right px-4 py-2.5 font-medium">Кол-во</th>
                  <th className="text-left px-4 py-2.5 font-medium">Поставщик</th>
                  <th className="text-left px-4 py-2.5 font-medium">Документ</th>
                  <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(r.receipt_date).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{r.material?.name || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">
                      {r.quantity} <span className="text-slate-400 text-xs font-normal">{r.material?.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{r.supplier || '—'}</td>
                    <td className="px-4 py-2.5">
                      {r.document_url ? (
                        <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" /> АПП
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(r.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать приход' : 'Новый приход на склад'} wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Дата прихода</label>
              <Input type="date" value={form.receipt_date} onChange={(v) => setForm({ ...form, receipt_date: v })} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Поставщик</label>
              <Input value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} placeholder="Напр. ТОО КабельТрейд" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Ссылка на документ (АПП/накладная)</label>
            <Input value={form.document_url} onChange={(v) => setForm({ ...form, document_url: v })} placeholder="https://..." />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Примечание</label>
            <Input value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} placeholder="Доп. информация" />
          </div>

          {/* Materials */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Материалы в накладной</label>
              {!editing && (
                <button onClick={addRow} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> Добавить позицию
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Select
                    value={rows[0]?.material_id || ''}
                    onChange={(v) => updateRow(0, 'material_id', v)}
                    options={data.materials.map((m) => ({ value: m.id, label: `${m.name}${m.article ? ' (' + m.article + ')' : ''}` }))}
                    placeholder="Материал..."
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={rows[0]?.quantity || ''}
                    onChange={(v) => updateRow(0, 'quantity', v)}
                    placeholder="Кол-во"
                    className="w-28"
                  />
                </div>
              </div>
            ) : (
              <>
                <input
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  placeholder="Поиск материала по названию или артикулу..."
                  className="w-full px-3 py-2 mb-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {rows.map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={row.material_id}
                        onChange={(e) => updateRow(idx, 'material_id', e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— выбрать материал —</option>
                        {filteredMaterials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.article ? ` (${m.article})` : ''} — {m.unit}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={row.quantity}
                        onChange={(e) => updateRow(idx, 'quantity', e.target.value)}
                        placeholder="Кол-во"
                        className="w-24 px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={() => removeRow(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
