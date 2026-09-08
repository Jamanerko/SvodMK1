import { useState } from 'react';
import { Plus, MapPin, Trash2, Edit3, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { OBJECT_TYPE_LABELS, type DbObject, type ObjectType } from '@/lib/types';

const TYPE_COLORS: Record<ObjectType, string> = {
  station: 'bg-blue-100 text-blue-700',
  crossover: 'bg-amber-100 text-amber-700',
  stretch: 'bg-emerald-100 text-emerald-700',
};

const TYPE_ICONS: Record<ObjectType, string> = {
  station: 'СТ',
  crossover: 'РЗД',
  stretch: 'ПГ',
};

export default function Objects() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DbObject | null>(null);
  const [form, setForm] = useState({ name: '', code: '', type: 'crossover' as ObjectType, from_object_id: '', to_object_id: '' });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const sorted = [...data.objects].sort((a, b) => a.sequence_order - b.sequence_order);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', type: 'crossover', from_object_id: '', to_object_id: '' });
    setModalOpen(true);
  };

  const openEdit = (obj: DbObject) => {
    setEditing(obj);
    setForm({
      name: obj.name,
      code: obj.code || '',
      type: obj.type,
      from_object_id: obj.from_object_id || '',
      to_object_id: obj.to_object_id || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload: any = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      type: form.type,
      from_object_id: form.type === 'stretch' ? (form.from_object_id || null) : null,
      to_object_id: form.type === 'stretch' ? (form.to_object_id || null) : null,
    };

    if (editing) {
      await supabase.from('objects').update(payload).eq('id', editing.id);
    } else {
      // Assign to end of list
      const maxOrder = sorted.length > 0 ? Math.max(...sorted.map((o) => o.sequence_order)) : 0;
      payload.sequence_order = maxOrder + 1;
      await supabase.from('objects').insert(payload);
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить объект? Все потребности и выдачи по нему также будут удалены.')) return;
    await supabase.from('objects').delete().eq('id', id);
    await refresh();
  };

  const handleReorder = async (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
    const newOrder = [...sorted];
    const [moved] = newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, moved);
    const updates = newOrder.map((obj, idx) => ({
      id: obj.id,
      sequence_order: idx + 1,
    }));
    await Promise.all(
      updates.map((u) =>
        supabase.from('objects').update({ sequence_order: u.sequence_order }).eq('id', u.id)
      )
    );
    await refresh();
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    handleReorder(idx, target);
  };

  if (loading) return <LoadingSpinner />;

  const objectOptions = sorted.map((o) => ({ value: o.id, label: o.name }));

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Всего: {sorted.length} · Станций: {sorted.filter((o) => o.type === 'station').length} · Разъездов: {sorted.filter((o) => o.type === 'crossover').length} · Перегонов: {sorted.filter((o) => o.type === 'stretch').length}
        </p>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Добавить объект
        </Button>
      </div>

      <Card>
        <CardHeader title="Объекты трассы" subtitle="Перетащите за полосу слева, чтобы изменить порядок" />
        {sorted.length === 0 ? (
          <EmptyState icon={MapPin} message="Объекты не добавлены" />
        ) : (
          <div className="divide-y divide-slate-100">
            {sorted.map((obj, idx) => (
              <div
                key={obj.id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverIndex(idx);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex !== null) {
                    handleReorder(dragIndex, idx);
                  }
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${
                  dragOverIndex === idx && dragIndex !== null ? 'border-t-2 border-t-blue-400' : ''
                } ${dragIndex === idx ? 'opacity-40' : ''}`}
              >
                <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500">
                  <GripVertical className="w-5 h-5" />
                </div>
                <span className="text-slate-400 text-xs font-mono w-6 text-right">{idx + 1}</span>
                <Badge color={TYPE_COLORS[obj.type]}>
                  {TYPE_ICONS[obj.type]} {OBJECT_TYPE_LABELS[obj.type]}
                </Badge>
                <span className="text-slate-800 font-medium flex-1">{obj.name}</span>
                {obj.code && <span className="text-slate-400 text-xs">{obj.code}</span>}
                {obj.type === 'stretch' && (
                  <span className="text-slate-400 text-xs hidden sm:inline">
                    {sorted.find((o) => o.id === obj.from_object_id)?.name || '?'} → {sorted.find((o) => o.id === obj.to_object_id)?.name || '?'}
                  </span>
                )}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveItem(idx, -1)}
                    disabled={idx === 0}
                    className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Переместить вверх"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => moveItem(idx, 1)}
                    disabled={idx === sorted.length - 1}
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
                  <button onClick={() => handleDelete(obj.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
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
              options={[
                { value: 'station', label: 'Станция' },
                { value: 'crossover', label: 'Разъезд' },
                { value: 'stretch', label: 'Перегон' },
              ]}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Название</label>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Напр. Разъезд 8" />
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
                  options={objectOptions}
                  placeholder="Выбрать..."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">До (объект)</label>
                <Select
                  value={form.to_object_id}
                  onChange={(v) => setForm({ ...form, to_object_id: v })}
                  options={objectOptions}
                  placeholder="Выбрать..."
                />
              </div>
            </div>
          )}
          {!editing && (
            <p className="text-xs text-slate-400">Порядковый номер присвоится автоматически (в конец списка). Изменить порядок можно перетаскиванием.</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
