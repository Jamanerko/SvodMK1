import { useState, useMemo } from 'react';
import { History, Search, Download, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Select, Input, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel, exportToPDF } from '@/lib/export';

export default function Corrections() {
  const { data, loading } = useData();
  const [search, setSearch] = useState('');
  const [filterMaterial, setFilterMaterial] = useState('');
  const [filterObject, setFilterObject] = useState('');
  const [allCorrections, setAllCorrections] = useState<any[] | null>(null);

  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const objectMap = useMemo(() => new Map(data.objects.map((o) => [o.id, o])), [data.objects]);

  // Load corrections on demand
  if (allCorrections === null && !loading) {
    supabase
      .from('requirement_corrections')
      .select('*')
      .order('changed_at', { ascending: false })
      .then(({ data: rows }) => setAllCorrections(rows || []));
  }

  const filtered = useMemo(() => {
    if (!allCorrections) return [];
    return allCorrections.filter((c) => {
      if (filterMaterial && c.material_id !== filterMaterial) return false;
      if (filterObject && c.object_id !== filterObject) return false;
      if (search) {
        const s = search.toLowerCase();
        const mat = materialMap.get(c.material_id);
        const obj = objectMap.get(c.object_id);
        return (
          (mat?.name || '').toLowerCase().includes(s) ||
          (obj?.name || '').toLowerCase().includes(s) ||
          (c.reason || '').toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [allCorrections, search, filterMaterial, filterObject, materialMap, objectMap]);

  const handleExport = () => {
    const rows = filtered.map((c) => {
      const mat = materialMap.get(c.material_id);
      const obj = objectMap.get(c.object_id);
      return {
        'Дата': new Date(c.changed_at).toLocaleString('ru-RU'),
        'Материал': mat?.name || '',
        'Артикул': mat?.article || '',
        'Объект': obj?.name || '',
        'Было': c.old_quantity,
        'Стало': c.new_quantity,
        'Разница': c.new_quantity - c.old_quantity,
        'Причина': c.reason || '',
        'Кто изменил': c.changed_by,
      };
    });
    exportToExcel(rows, 'Корректировки', 'korrektirovki');
  };

  if (loading || allCorrections === null) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">Всего корректировок: {allCorrections.length}</p>
        <Button onClick={handleExport} variant="secondary">
          <Download className="w-4 h-4" /> Excel
        </Button>
      </div>

      <Card>
        <CardHeader title="История корректировок" subtitle="Все изменения потребности: когда, кто, было/стало, причина" />
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-slate-100">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по материалу, объекту, причине..."
              className="w-full pl-10 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Select
            value={filterMaterial}
            onChange={setFilterMaterial}
            options={data.materials.map((m) => ({ value: m.id, label: m.name }))}
            placeholder="Все материалы"
            className="sm:w-48"
          />
          <Select
            value={filterObject}
            onChange={setFilterObject}
            options={data.objects.map((o) => ({ value: o.id, label: o.name }))}
            placeholder="Все объекты"
            className="sm:w-48"
          />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={History} message="Корректировок не найдено" />
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-left px-4 py-2.5 font-medium">Объект</th>
                  <th className="text-right px-4 py-2.5 font-medium">Было</th>
                  <th className="text-center px-4 py-2.5 font-medium"></th>
                  <th className="text-right px-4 py-2.5 font-medium">Стало</th>
                  <th className="text-right px-4 py-2.5 font-medium">Разница</th>
                  <th className="text-left px-4 py-2.5 font-medium">Причина</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const mat = materialMap.get(c.material_id);
                  const obj = objectMap.get(c.object_id);
                  const diff = c.new_quantity - c.old_quantity;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                        {new Date(c.changed_at).toLocaleString('ru-RU')}
                      </td>
                      <td className="px-4 py-2.5 text-slate-800 font-medium">{mat?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{obj?.name || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500">{c.old_quantity}</td>
                      <td className="px-4 py-2.5 text-center text-slate-400">
                        <ArrowRight className="w-3.5 h-3.5 inline" />
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-800 font-semibold">{c.new_quantity}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-slate-400'}`}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{c.reason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
