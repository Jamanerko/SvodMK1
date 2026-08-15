import { useState } from 'react';
import { Plus, Users, Trash2, Edit3, MapPin, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Input, Select, Modal, Badge, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';

export default function Contractors() {
  const { data, loading, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [objModalOpen, setObjModalOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', contact: '' });
  const [newObjectId, setNewObjectId] = useState('');

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', contact: '' });
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    const c = data.contractors.find((x) => x.id === id);
    if (!c) return;
    setEditing(id);
    setForm({ name: c.name, contact: c.contact || '' });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name.trim(), contact: form.contact.trim() || null };
    if (editing) {
      await supabase.from('contractors').update(payload).eq('id', editing);
    } else {
      await supabase.from('contractors').insert(payload);
    }
    setModalOpen(false);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить подрядчика?')) return;
    await supabase.from('contractors').delete().eq('id', id);
    await refresh();
  };

  const getContractorObjectIds = (contractorId: string) =>
    data.contractorObjects.filter((co) => co.contractor_id === contractorId).map((co) => co.object_id);

  const handleAddObject = async (contractorId: string, objectId: string) => {
    if (!objectId) return;
    await supabase.from('contractor_objects').insert({ contractor_id: contractorId, object_id: objectId });
    setNewObjectId('');
    await refresh();
  };

  const handleRemoveObject = async (contractorId: string, objectId: string) => {
    await supabase
      .from('contractor_objects')
      .delete()
      .eq('contractor_id', contractorId)
      .eq('object_id', objectId);
    await refresh();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Всего подрядчиков: {data.contractors.length}</p>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" /> Добавить подрядчика
        </Button>
      </div>

      <Card>
        <CardHeader title="Подрядчики" subtitle="Компании, выполняющие монтаж на объектах" />
        {data.contractors.length === 0 ? (
          <EmptyState icon={Users} message="Подрядчики не добавлены" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Название</th>
                  <th className="text-left px-4 py-2.5 font-medium">Контакт</th>
                  <th className="text-left px-4 py-2.5 font-medium">Объекты</th>
                  <th className="text-right px-4 py-2.5 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.contractors.map((c) => {
                  const objIds = getContractorObjectIds(c.id);
                  const objs = data.objects.filter((o) => objIds.includes(o.id));
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{c.name}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{c.contact || '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {objs.map((o) => (
                            <Badge key={o.id}>
                              {o.name}
                              <button
                                onClick={() => handleRemoveObject(c.id, o.id)}
                                className="ml-1 hover:text-red-500"
                              >
                                <X className="w-3 h-3 inline" />
                              </button>
                            </Badge>
                          ))}
                          {objIds.length === 0 && <span className="text-slate-400 text-xs">Не назначены</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setObjModalOpen(c.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="Назначить объекты">
                            <MapPin className="w-4 h-4" />
                          </button>
                          <button onClick={() => openEdit(c.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Редактировать подрядчика' : 'Новый подрядчик'}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Название компании</label>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Напр. ТОО СтройМонтаж" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1 block">Контакт (телефон, ФИО)</label>
            <Input value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} placeholder="+7 777 123 45 67, Иван" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!objModalOpen} onClose={() => setObjModalOpen(null)} title="Назначить объекты подрядчику">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Select
              value={newObjectId}
              onChange={setNewObjectId}
              options={data.objects
                .filter((o) => !getContractorObjectIds(objModalOpen || '').includes(o.id))
                .map((o) => ({ value: o.id, label: o.name }))}
              placeholder="Выбрать объект..."
              className="flex-1"
            />
            <Button
              onClick={() => objModalOpen && handleAddObject(objModalOpen, newObjectId)}
              disabled={!newObjectId}
            >
              <Plus className="w-4 h-4" /> Добавить
            </Button>
          </div>
          <div className="space-y-1">
            {getContractorObjectIds(objModalOpen || '').map((oid) => {
              const obj = data.objects.find((o) => o.id === oid);
              if (!obj) return null;
              return (
                <div key={oid} className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                  <span className="text-sm text-slate-700">{obj.name}</span>
                  <button
                    onClick={() => objModalOpen && handleRemoveObject(objModalOpen, oid)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
