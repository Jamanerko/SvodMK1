import { useState, useMemo, useRef } from 'react';
import { Plus, Package, Trash2, Edit3, Search, Download, Upload, X, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel } from '@/lib/export';

const UNIT_OPTIONS = ['шт', 'м', 'км', 'кг', 'т', 'комплект', 'л', 'м²', 'м³', 'упак'];

interface BulkRow {
  name: string;
  article: string;
  unit: string;
  category_id: string;
  object_id: string;
  quantity: string;
}

export default function Materials() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', article: '', unit: 'шт', category_id: '' });
  const [catName, setCatName] = useState('');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);

  const categoryMap = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);

  const filtered = useMemo(() => {
    return data.materials.filter((m) => {
      if (filterCat && m.category_id !== filterCat) return false;
      if (search) {
        const s = search.toLowerCase();
        return m.name.toLowerCase().includes(s) || (m.article || '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [data.materials, search, filterCat]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', article: '', unit: 'шт', category_id: '' });
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    const m = data.materials.find((x) => x.id === id);
    if (!m) return;
    setEditing(id);
    setForm({ name: m.name, article: m.article || '', unit: m.unit, category_id: m.category_id || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(),
      article: form.article.trim() || null,
      unit: form.unit.trim() || 'шт',
      category_id: form.category_id || null,
    };
    if (editing) {
      await supabase.from('materials').update(payload).eq('id', editing);
    } else {
      await supabase.from('materials').insert(payload);
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить материал? Все потребности и заявки по нему также будут удалены.')) return;
    await supabase.from('materials').delete().eq('id', id);
    await refresh();
  };

  const handleAddCategory = async () => {
    if (!catName.trim()) return;
    await supabase.from('material_categories').insert({ name: catName.trim() });
    setCatName('');
    setCatModalOpen(false);
    await refresh();
  };

  const openBulk = () => {
    setBulkRows([{ name: '', article: '', unit: 'шт', category_id: '', object_id: '', quantity: '' }]);
    setBulkModalOpen(true);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const template = [
      { 'Материал': 'Провод СИП-2 3x50', 'Артикул': 'СИП2-3x50', 'Ед.': 'м', 'Категория': 'Кабельная продукция', 'Объект': 'Перегон Кызылжар — Рзд 1', 'Количество': 5000 },
      { 'Материал': 'Изолятор ШФ-20', 'Артикул': 'ШФ20', 'Ед.': 'шт', 'Категория': 'Линейная арматура', 'Объект': 'Разъезд 1', 'Количество': 120 },
    ];
    exportToExcel(template, 'Шаблон', 'shablon_zagruzki');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (!result) return;
      const wb = XLSX.read(result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const objectMap = new Map(data.objects.map((o) => [o.name.toLowerCase(), o.id]));
      const catMap = new Map(data.categories.map((c) => [c.name.toLowerCase(), c.id]));
      const parsed: BulkRow[] = rows.map((r) => {
        const objName = String(r['Объект'] || r['object'] || '').trim();
        const catName = String(r['Категория'] || r['category'] || '').trim();
        const unit = String(r['Ед.'] || r['Ед. изм.'] || r['unit'] || 'шт').trim();
        return {
          name: String(r['Материал'] || r['material'] || '').trim(),
          article: String(r['Артикул'] || r['article'] || '').trim(),
          unit: UNIT_OPTIONS.includes(unit) ? unit : 'шт',
          category_id: catMap.get(catName.toLowerCase()) || '',
          object_id: objectMap.get(objName.toLowerCase()) || '',
          quantity: String(r['Количество'] || r['quantity'] || '').trim(),
        };
      }).filter((r) => r.name);
      if (parsed.length > 0) {
        setBulkRows(parsed);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const addBulkRow = () => {
    setBulkRows([...bulkRows, { name: '', article: '', unit: 'шт', category_id: '', object_id: '', quantity: '' }]);
  };

  const removeBulkRow = (idx: number) => {
    setBulkRows(bulkRows.filter((_, i) => i !== idx));
  };

  const updateBulkRow = (idx: number, field: keyof BulkRow, value: string) => {
    const copy = [...bulkRows];
    (copy[idx] as any)[field] = value;
    setBulkRows(copy);
  };

  const handleBulkSave = async () => {
    const validRows = bulkRows.filter((r) => r.name.trim());
    const createdMaterials = new Map<string, string>();
    for (const row of validRows) {
      const nameKey = row.name.trim().toLowerCase();
      const articleKey = (row.article.trim() || '').toLowerCase();
      const matchKey = `${nameKey}||${articleKey}`;
      let materialId: string | null = null;
      const existing = data.materials.find(
        (m) => m.name.toLowerCase() === nameKey && (m.article || '').toLowerCase() === articleKey,
      );
      if (existing) {
        materialId = existing.id;
      } else if (createdMaterials.has(matchKey)) {
        materialId = createdMaterials.get(matchKey)!;
      } else {
        const { data: inserted } = await supabase.from('materials').insert({
          name: row.name.trim(),
          article: row.article.trim() || null,
          unit: row.unit || 'шт',
          category_id: row.category_id || null,
        }).select().single();
        materialId = inserted?.id || null;
        if (materialId) createdMaterials.set(matchKey, materialId);
      }
      if (materialId && row.object_id && row.quantity) {
        const existingReq = data.requirements.find(
          (r) => r.material_id === materialId && r.object_id === row.object_id,
        );
        if (existingReq) {
          await supabase.from('requirements').update({ quantity: parseFloat(row.quantity) }).eq('id', existingReq.id);
        } else {
          const { data: reqInserted } = await supabase.from('requirements').insert({
            material_id: materialId,
            object_id: row.object_id,
            quantity: parseFloat(row.quantity),
          }).select().single();
          if (reqInserted) {
            await supabase.from('requirement_corrections').insert({
              requirement_id: reqInserted.id,
              material_id: materialId,
              object_id: row.object_id,
              old_quantity: 0,
              new_quantity: parseFloat(row.quantity),
              reason: 'Массовая загрузка',
              changed_by: 'operator',
            });
          }
        }
      }
    }
    setBulkModalOpen(false);
    await refresh();
  };

  const handleExport = () => {
    const rows = filtered.map((m) => ({
      'Наименование': m.name,
      'Артикул': m.article || '',
      'Ед. изм.': m.unit,
      'Категория': categoryMap.get(m.category_id || '')?.name || '',
    }));
    exportToExcel(rows, 'Материалы', 'materialy');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего: {data.materials.length} · Категорий: {data.categories.length}</p>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={() => setCatModalOpen(true)}>
            <Plus className="w-4 h-4" /> Категория
          </Button>
          <Button variant="secondary" onClick={openBulk}>
            <Upload className="w-4 h-4" /> Массовая загрузка
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" /> Добавить материал
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Материалы"
          subtitle="Справочник материалов с артикулами и категориями"
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
              placeholder="Поиск по названию или артикулу..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select
            value={filterCat}
            onChange={setFilterCat}
            options={data.categories.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="Все категории"
            className="sm:w-56"
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Package} message="Материалы не найдены" />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-left px-4 py-2.5 font-medium">Артикул</th>
                  <th className="text-left px-4 py-2.5 font-medium">Ед.</th>
                  <th className="text-left px-4 py-2.5 font-medium">Категория</th>
                  <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{m.name}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{m.article || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{m.unit}</td>
                    <td className="px-4 py-2.5">
                      {m.category_id && categoryMap.get(m.category_id) ? (
                        <Badge>{categoryMap.get(m.category_id)!.name}</Badge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openEdit(m.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать материал' : 'Новый материал'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Наименование</label>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Название материала" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Артикул</label>
              <Input value={form.article} onChange={(v) => setForm({ ...form, article: v })} placeholder="Код" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Ед. изм.</label>
              <Select
                value={form.unit}
                onChange={(v) => setForm({ ...form, unit: v })}
                options={UNIT_OPTIONS.map((u) => ({ value: u, label: u }))}
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Категория</label>
            <Select
              value={form.category_id}
              onChange={(v) => setForm({ ...form, category_id: v })}
              options={data.categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Без категории"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      {/* Category modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Новая категория">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Название категории</label>
            <Input value={catName} onChange={setCatName} placeholder="Напр. Кабельная продукция" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCatModalOpen(false)}>Отмена</Button>
            <Button onClick={handleAddCategory}>Добавить</Button>
          </div>
        </div>
      </Modal>

      {/* Bulk import modal */}
      <Modal open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} title="Массовая загрузка материалов и потребности" wide>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Заполните список: название материала, артикул, единица, категория, объект и количество. Если материал уже существует, он будет обновлён.
          </p>
          <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg bg-blue-50 border border-blue-100">
            <FileSpreadsheet className="w-5 h-5 text-blue-600 shrink-0" />
            <p className="text-xs text-blue-700 flex-1 min-w-0">
              Загрузите Excel-файл со столбцами: Материал, Артикул, Ед., Категория, Объект, Количество. Названия объектов и категорий должны совпадать с уже созданными в системе.
            </p>
            <button
              onClick={downloadTemplate}
              className="px-3 py-1.5 text-xs rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-100 font-medium flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Скачать шаблон
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium flex items-center gap-1.5 shrink-0"
            >
              <Upload className="w-3.5 h-3.5" /> Загрузить Excel
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase">
                  <th className="text-left pb-1 px-1">Материал</th>
                  <th className="text-left pb-1 px-1">Артикул</th>
                  <th className="text-left pb-1 px-1">Ед.</th>
                  <th className="text-left pb-1 px-1">Категория</th>
                  <th className="text-left pb-1 px-1">Объект</th>
                  <th className="text-left pb-1 px-1">Кол-во</th>
                  <th className="pb-1 px-1"></th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-1 px-1">
                      <input
                        value={row.name}
                        onChange={(e) => updateBulkRow(idx, 'name', e.target.value)}
                        placeholder="Название"
                        className="w-full px-2 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <input
                        value={row.article}
                        onChange={(e) => updateBulkRow(idx, 'article', e.target.value)}
                        placeholder="Артикул"
                        className="w-20 px-2 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <select
                        value={row.unit}
                        onChange={(e) => updateBulkRow(idx, 'unit', e.target.value)}
                        className="px-1.5 py-1.5 rounded border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {UNIT_OPTIONS.map((u) => (
                          <option key={u} value={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <select
                        value={row.category_id}
                        onChange={(e) => updateBulkRow(idx, 'category_id', e.target.value)}
                        className="w-28 px-1.5 py-1.5 rounded border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">—</option>
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <select
                        value={row.object_id}
                        onChange={(e) => updateBulkRow(idx, 'object_id', e.target.value)}
                        className="w-32 px-1.5 py-1.5 rounded border border-slate-300 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">—</option>
                        {data.objects.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 px-1">
                      <input
                        type="number"
                        value={row.quantity}
                        onChange={(e) => updateBulkRow(idx, 'quantity', e.target.value)}
                        placeholder="0"
                        className="w-16 px-2 py-1.5 rounded border border-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                    <td className="py-1 px-1">
                      <button onClick={() => removeBulkRow(idx)} className="text-red-500 hover:text-red-700 p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addBulkRow} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            <Plus className="w-4 h-4" /> Добавить строку
          </button>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setBulkModalOpen(false)}>Отмена</Button>
            <Button onClick={handleBulkSave}>Загрузить</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
