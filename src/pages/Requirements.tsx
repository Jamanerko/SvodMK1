import { useMemo, useState } from 'react';
import { Plus, ClipboardList, Trash2, Edit3, Search, Download, History, AlertTriangle, ChevronRight, ChevronDown, CornerDownRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { getOwningObjectId, getObjectLabel, buildChildrenMap } from '@/lib/objectTree';
import { Card, CardHeader, Button, Input, Select, SearchSelect, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel } from '@/lib/export';
import { OBJECT_TYPE_LABELS, type DbObject, type Material, type Requirement } from '@/lib/types';

interface RequirementLine {
  requirement: Requirement;
  object: DbObject | undefined;
}

interface RequirementGroup {
  key: string;
  ownerId: string;
  owner: DbObject | undefined;
  materialId: string;
  material: Material | undefined;
  total: number;
  lines: RequirementLine[];
}

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
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const objectMap = useMemo(() => new Map(data.objects.map((o) => [o.id, o])), [data.objects]);
  const objectOrder = useMemo(() => new Map(data.objects.map((o, index) => [o.id, index])), [data.objects]);

  const groups = useMemo(() => {
    const map = new Map<string, RequirementGroup>();
    for (const r of data.requirements) {
      const object = objectMap.get(r.object_id);
      const ownerId = object ? getOwningObjectId(object) : r.object_id;
      const key = `${ownerId}|${r.material_id}`;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          ownerId,
          owner: objectMap.get(ownerId),
          materialId: r.material_id,
          material: materialMap.get(r.material_id),
          total: 0,
          lines: [],
        };
        map.set(key, group);
      }
      group.total += r.quantity;
      group.lines.push({ requirement: r, object });
    }
    for (const group of map.values()) {
      group.lines.sort((a, b) => (objectOrder.get(a.requirement.object_id) ?? 0) - (objectOrder.get(b.requirement.object_id) ?? 0));
    }
    return [...map.values()].sort(
      (a, b) =>
        (objectOrder.get(a.ownerId) ?? Number.MAX_SAFE_INTEGER) - (objectOrder.get(b.ownerId) ?? Number.MAX_SAFE_INTEGER) ||
        (a.material?.name || '').localeCompare(b.material?.name || '', 'ru'),
    );
  }, [data.requirements, objectMap, materialMap, objectOrder]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return groups.filter((g) => {
      if (filterObject && g.ownerId !== filterObject && !g.lines.some((l) => l.requirement.object_id === filterObject)) return false;
      if (filterMaterial && g.materialId !== filterMaterial) return false;
      if (s) {
        const text = [
          g.material?.name || '',
          g.material?.article || '',
          g.owner?.name || '',
          ...g.lines.map((l) => l.object?.name || ''),
        ].join(' ').toLowerCase();
        return text.includes(s);
      }
      return true;
    });
  }, [groups, search, filterObject, filterMaterial]);

  const toggleExpanded = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  const openEdit = (req: Requirement) => {
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
    const rows = filtered.flatMap((g) =>
      g.lines.map((l) => ({
        'Материал': g.material?.name || '',
        'Артикул': g.material?.article || '',
        'Ед. изм.': g.material?.unit || '',
        'Основной объект': g.owner?.name || '',
        'Объект': l.object?.name || '',
        'Тип объекта': l.object ? OBJECT_TYPE_LABELS[l.object.type] : '',
        'Количество': l.requirement.quantity,
      })),
    );
    exportToExcel(rows, 'Потребность', 'potrebnost');
  };

  if (loading) return <LoadingSpinner />;

  const childrenMap = buildChildrenMap(data.objects);
  const objectOptions = data.objects.map((o) => ({ value: o.id, label: getObjectLabel(o, objectMap) }));
  const filterObjectOptions = data.objects
    .filter((o) => o.parent_id === null)
    .flatMap((o) => [o, ...(childrenMap.get(o.id) || [])])
    .map((o) => ({ value: o.id, label: getObjectLabel(o, objectMap) }));

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
          subtitle="Итог по основному объекту включает материалы его подобъектов. Разверните строку, чтобы увидеть детализацию"
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
            options={filterObjectOptions}
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
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-left px-4 py-2.5 font-medium">Артикул</th>
                  <th className="text-left px-4 py-2.5 font-medium">Объект</th>
                  <th className="text-right px-4 py-2.5 font-medium">Итого</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((g) => {
                  const expanded = expandedKeys.has(g.key);
                  const hasSubObjects = g.lines.some((l) => l.requirement.object_id !== g.ownerId);
                  return (
                    <GroupRows
                      key={g.key}
                      group={g}
                      expanded={expanded}
                      hasSubObjects={hasSubObjects}
                      onToggle={() => toggleExpanded(g.key)}
                      onHistory={openHistory}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  );
                })}
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
              options={objectOptions}
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
                    <div className="text-sm text-slate-700">{mat?.name} · {obj ? getObjectLabel(obj, objectMap) : ''}</div>
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

interface GroupRowsProps {
  group: RequirementGroup;
  expanded: boolean;
  hasSubObjects: boolean;
  onToggle: () => void;
  onHistory: (id: string) => void;
  onEdit: (req: Requirement) => void;
  onDelete: (id: string) => void;
}

function GroupRows({ group, expanded, hasSubObjects, onToggle, onHistory, onEdit, onDelete }: GroupRowsProps) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <>
      <tr className="hover:bg-slate-50">
        <td className="px-4 py-2.5 text-slate-800 font-medium">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex items-center gap-1.5 text-left hover:text-blue-700"
          >
            <Chevron className="w-4 h-4 text-slate-400 shrink-0" />
            {group.material?.name || '—'}
          </button>
        </td>
        <td className="px-4 py-2.5 text-slate-500 text-xs">{group.material?.article || '—'}</td>
        <td className="px-4 py-2.5 text-slate-600">
          <div className="flex items-center gap-2">
            <span>{group.owner?.name || '—'}</span>
            {group.owner && <Badge>{OBJECT_TYPE_LABELS[group.owner.type]}</Badge>}
            {hasSubObjects && <span className="text-xs text-slate-400">с подобъектами</span>}
          </div>
        </td>
        <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">{group.total.toLocaleString('ru-RU')}</td>
      </tr>
      {expanded &&
        group.lines.map((line) => {
          const isOwn = line.requirement.object_id === group.ownerId;
          return (
            <tr key={line.requirement.id} className="bg-slate-50/70 text-sm">
              <td className="px-4 py-2 text-slate-400 text-xs">
                <span className="inline-flex items-center gap-1 pl-6">
                  <CornerDownRight className="w-3.5 h-3.5" />
                  Детализация
                </span>
              </td>
              <td className="px-4 py-2" />
              <td className="px-4 py-2 text-slate-600">
                <div className="flex items-center gap-2">
                  <span>{isOwn ? `На сам объект «${group.owner?.name || ''}»` : line.object?.name || '—'}</span>
                  {line.object && !isOwn && <Badge>{OBJECT_TYPE_LABELS[line.object.type]}</Badge>}
                </div>
              </td>
              <td className="px-4 py-2 text-right">
                <div className="flex justify-end items-center gap-1">
                  <span className="text-slate-700 font-medium mr-2">{line.requirement.quantity.toLocaleString('ru-RU')}</span>
                  <button onClick={() => onHistory(line.requirement.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="История корректировок">
                    <History className="w-4 h-4" />
                  </button>
                  <button onClick={() => onEdit(line.requirement)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Изменить">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => onDelete(line.requirement.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Удалить">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
    </>
  );
}
