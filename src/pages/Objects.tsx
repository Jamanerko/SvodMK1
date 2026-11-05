import { useState } from 'react';
import { Plus, MapPin, Trash2, Edit3, GripVertical, ChevronUp, ChevronDown, CornerDownRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { buildChildrenMap, getMainObjects, sortBySequence } from '@/lib/objectTree';
import { Card, CardHeader, Button, Input, Select, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import {
  OBJECT_TYPE_LABELS,
  MAIN_OBJECT_TYPES,
  SUB_OBJECT_TYPES,
  isSubObjectType,
  type DbObject,
  type ObjectType,
} from '@/lib/types';

const TYPE_COLORS: Record<ObjectType, string> = {
  station: 'bg-blue-100 text-blue-700',
  crossover: 'bg-amber-100 text-amber-700',
  stretch: 'bg-emerald-100 text-emerald-700',
  maps: 'bg-sky-100 text-sky-700',
  ms: 'bg-orange-100 text-orange-700',
  ktsm: 'bg-rose-100 text-rose-700',
  crossing: 'bg-lime-100 text-lime-700',
  other: 'bg-slate-200 text-slate-700',
};

const EMPTY_FORM = {
  name: '',
  code: '',
  type: 'crossover' as ObjectType,
  parent_id: '',
  from_object_id: '',
  to_object_id: '',
};

export default function Objects() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DbObject | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const sorted = sortBySequence(data.objects);
  const mainObjects = getMainObjects(data.objects);
  const childrenMap = buildChildrenMap(data.objects);
  const objectMap = new Map(data.objects.map((o) => [o.id, o]));
  const subCount = data.objects.length - mainObjects.length;

  const siblingsOf = (obj: DbObject): DbObject[] =>
    obj.parent_id ? childrenMap.get(obj.parent_id) || [] : mainObjects;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (obj: DbObject) => {
    setEditing(obj);
    setForm({
      name: obj.name,
      code: obj.code || '',
      type: obj.type,
      parent_id: obj.parent_id || '',
      from_object_id: obj.from_object_id || '',
      to_object_id: obj.to_object_id || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name.trim()) {
      setFormError('Укажите название объекта');
      return;
    }
    const isSub = isSubObjectType(form.type);
    if (isSub && !form.parent_id) {
      setFormError('Выберите родительский объект, к которому привязан подобъект');
      return;
    }
    if (editing && isSub && (childrenMap.get(editing.id)?.length ?? 0) > 0) {
      setFormError('У этого объекта есть подобъекты. Сначала переместите или удалите их');
      return;
    }

    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      type: form.type,
      parent_id: isSub ? form.parent_id : null,
      from_object_id: form.type === 'stretch' ? (form.from_object_id || null) : null,
      to_object_id: form.type === 'stretch' ? (form.to_object_id || null) : null,
    };

    const siblings = isSub ? childrenMap.get(form.parent_id) || [] : mainObjects;
    const nextOrder = siblings.reduce((max, o) => Math.max(max, o.sequence_order), 0) + 1;
    const { error } = editing
      ? await supabase.from('objects').update(payload).eq('id', editing.id)
      : await supabase.from('objects').insert({ ...payload, sequence_order: nextOrder });
    if (error) {
      setFormError('Не удалось сохранить объект. Попробуйте ещё раз');
      return;
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (obj: DbObject) => {
    if ((childrenMap.get(obj.id)?.length ?? 0) > 0) {
      alert('Сначала удалите или перенесите подобъекты этого объекта.');
      return;
    }
    if (!confirm('Удалить объект? Все потребности и выдачи по нему также будут удалены.')) return;
    await supabase.from('objects').delete().eq('id', obj.id);
    await refresh();
  };

  const reorder = async (siblings: DbObject[], fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const next = [...siblings];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    await Promise.all(
      next.map((obj, idx) => supabase.from('objects').update({ sequence_order: idx + 1 }).eq('id', obj.id))
    );
    await refresh();
  };

  const moveItem = (obj: DbObject, dir: -1 | 1) => {
    const siblings = siblingsOf(obj);
    const idx = siblings.findIndex((o) => o.id === obj.id);
    reorder(siblings, idx, idx + dir);
  };

  const handleDrop = (target: DbObject) => {
    const dragged = dragId ? objectMap.get(dragId) : undefined;
    setDragId(null);
    setDragOverId(null);
    if (!dragged || dragged.id === target.id || dragged.parent_id !== target.parent_id) return;
    const siblings = siblingsOf(target);
    reorder(
      siblings,
      siblings.findIndex((o) => o.id === dragged.id),
      siblings.findIndex((o) => o.id === target.id),
    );
  };

  if (loading) return <LoadingSpinner />;

  const mainOptions = mainObjects
    .filter((o) => o.id !== editing?.id)
    .map((o) => ({ value: o.id, label: `${OBJECT_TYPE_LABELS[o.type]} · ${o.name}` }));
  const typeOptions = [...MAIN_OBJECT_TYPES, ...SUB_OBJECT_TYPES].map((t) => ({ value: t, label: OBJECT_TYPE_LABELS[t] }));
  const isSub = isSubObjectType(form.type);

  const rows: { obj: DbObject; isChild: boolean }[] = mainObjects.flatMap((m) => [
    { obj: m, isChild: false },
    ...(childrenMap.get(m.id) || []).map((c) => ({ obj: c, isChild: true })),
  ]);

  const childSummary = (parentId: string) => {
    const counts = new Map<ObjectType, number>();
    for (const c of childrenMap.get(parentId) || []) counts.set(c.type, (counts.get(c.type) || 0) + 1);
    return [...counts.entries()].map(([type, n]) => `${n} × ${OBJECT_TYPE_LABELS[type]}`).join(' · ');
  };

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">
          Основных: {mainObjects.length} · Подобъектов: {subCount} · Станций: {sorted.filter((o) => o.type === 'station').length} · Разъездов: {sorted.filter((o) => o.type === 'crossover').length} · Перегонов: {sorted.filter((o) => o.type === 'stretch').length}
        </p>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Добавить объект
        </Button>
      </div>

      <Card>
        <CardHeader title="Объекты трассы" subtitle="Подобъекты показаны под своим родительским объектом. Перетаскивайте внутри одной группы, чтобы изменить порядок" />
        {sorted.length === 0 ? (
          <EmptyState icon={MapPin} message="Объекты не добавлены" />
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map(({ obj, isChild }) => {
              const siblings = siblingsOf(obj);
              const idx = siblings.findIndex((o) => o.id === obj.id);
              const isDropTarget = dragOverId === obj.id && dragId !== null && objectMap.get(dragId)?.parent_id === obj.parent_id;
              return (
                <div
                  key={obj.id}
                  draggable
                  onDragStart={() => setDragId(obj.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDragOverId(obj.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(obj);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  className={`flex items-center gap-3 py-3 pr-4 hover:bg-slate-50 transition-colors ${
                    isChild ? 'pl-12 bg-slate-50/50' : 'pl-4'
                  } ${isDropTarget ? 'border-t-2 border-t-blue-400' : ''} ${dragId === obj.id ? 'opacity-40' : ''}`}
                >
                  <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                    <GripVertical className="w-5 h-5" />
                  </div>
                  {isChild ? (
                    <CornerDownRight className="w-4 h-4 text-slate-300 -ml-1 shrink-0" />
                  ) : (
                    <span className="text-slate-400 text-xs font-mono w-6 text-right">{idx + 1}</span>
                  )}
                  <Badge color={TYPE_COLORS[obj.type]}>{OBJECT_TYPE_LABELS[obj.type]}</Badge>
                  <div className="flex-1 min-w-0">
                    <span className={`block truncate ${isChild ? 'text-slate-700 text-sm' : 'text-slate-800 font-medium'}`}>{obj.name}</span>
                    {!isChild && childrenMap.has(obj.id) && (
                      <span className="block text-xs text-slate-400 truncate">{childSummary(obj.id)}</span>
                    )}
                    {isChild && objectMap.get(obj.parent_id || '') && (
                      <span className="block text-xs text-slate-400 truncate">к объекту: {objectMap.get(obj.parent_id || '')?.name}</span>
                    )}
                  </div>
                  {obj.code && <span className="text-slate-400 text-xs">{obj.code}</span>}
                  {obj.type === 'stretch' && (
                    <span className="text-slate-400 text-xs hidden sm:inline">
                      {objectMap.get(obj.from_object_id || '')?.name || '?'} → {objectMap.get(obj.to_object_id || '')?.name || '?'}
                    </span>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveItem(obj, -1)}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Переместить вверх"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => moveItem(obj, 1)}
                      disabled={idx === siblings.length - 1}
                      className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Переместить вниз"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(obj)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(obj)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать объект' : 'Новый объект'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Тип объекта</label>
            <Select
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v as ObjectType })}
              options={typeOptions}
            />
          </div>
          {isSub && (
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">Привязать к родительскому объекту</label>
              <Select
                value={form.parent_id}
                onChange={(v) => setForm({ ...form, parent_id: v })}
                options={mainOptions}
                placeholder="Выбрать станцию, перегон или разъезд..."
              />
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Название</label>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder={isSub ? 'Напр. КТСМ-1' : 'Напр. Разъезд 8'} />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Код (необязательно)</label>
            <Input value={form.code} onChange={(v) => setForm({ ...form, code: v })} placeholder="Напр. РЗД-8" />
          </div>
          {form.type === 'stretch' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">От (объект)</label>
                <Select
                  value={form.from_object_id}
                  onChange={(v) => setForm({ ...form, from_object_id: v })}
                  options={mainOptions}
                  placeholder="Выбрать..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">До (объект)</label>
                <Select
                  value={form.to_object_id}
                  onChange={(v) => setForm({ ...form, to_object_id: v })}
                  options={mainOptions}
                  placeholder="Выбрать..."
                />
              </div>
            </div>
          )}
          {!editing && (
            <p className="text-xs text-slate-400">Порядковый номер присвоится автоматически (в конец списка). Изменить порядок можно перетаскиванием.</p>
          )}
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
