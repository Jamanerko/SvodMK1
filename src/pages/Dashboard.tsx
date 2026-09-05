import { useMemo, useState } from 'react';
import { AlertTriangle, Package, TrendingDown, Warehouse, ArrowDownRight, ShoppingCart, ChevronRight, Users, MapPin, X } from 'lucide-react';
import { useData } from '@/lib/useData';
import { Card, CardHeader, LoadingSpinner, Badge, PageContainer, Modal } from '@/components/ui';
import { OBJECT_TYPE_LABELS, PR_STATUS_LABELS, PR_STATUS_COLORS, ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS } from '@/lib/types';
import { exportToExcel, exportToPDF } from '@/lib/export';

export default function Dashboard() {
  const { data, loading } = useData();
  const [drillDown, setDrillDown] = useState<{ type: string; title: string; contractorId?: string } | null>(null);

  const stats = useMemo(() => {
    const materialMap = new Map(data.materials.map((m) => [m.id, m]));
    const objectMap = new Map(data.objects.map((o) => [o.id, o]));
    const contractorMap = new Map(data.contractors.map((c) => [c.id, c]));
    const categoryMap = new Map(data.categories.map((c) => [c.id, c]));

    const requiredByMaterial = new Map<string, number>();
    for (const req of data.requirements) {
      requiredByMaterial.set(req.material_id, (requiredByMaterial.get(req.material_id) || 0) + req.quantity);
    }

    const orderedByMaterial = new Map<string, number>();
    for (const pr of data.purchaseRequests) {
      if (pr.status !== 'cancelled') {
        orderedByMaterial.set(pr.material_id, (orderedByMaterial.get(pr.material_id) || 0) + pr.total_quantity);
      }
    }

    const receivedByMaterial = new Map<string, number>();
    for (const r of data.receipts) {
      receivedByMaterial.set(r.material_id, (receivedByMaterial.get(r.material_id) || 0) + r.quantity);
    }

    const issuedByMaterial = new Map<string, number>();
    const confirmedIssueIds = new Set(data.issues.filter((i) => i.status === 'confirmed').map((i) => i.id));
    for (const item of data.issueItems) {
      if (confirmedIssueIds.has(item.warehouse_issue_id)) {
        issuedByMaterial.set(item.material_id, (issuedByMaterial.get(item.material_id) || 0) + item.quantity);
      }
    }

    const deficits: any[] = [];
    for (const m of data.materials) {
      const required = requiredByMaterial.get(m.id) || 0;
      const ordered = orderedByMaterial.get(m.id) || 0;
      const onHand = (receivedByMaterial.get(m.id) || 0) - (issuedByMaterial.get(m.id) || 0);
      const deficit = required - ordered;
      if (deficit > 0.01) {
        deficits.push({ material: m.name, article: m.article || '', unit: m.unit, required, ordered, deficit, onHand, category: categoryMap.get(m.category_id || '')?.name || '' });
      }
    }
    deficits.sort((a, b) => b.deficit - a.deficit);

    const unprocured = deficits.filter((d) => d.ordered === 0);
    const inTransit = data.purchaseRequests.filter((p) => p.status === 'in_transit' || p.status === 'accepted' || p.status === 'submitted');

    // Contractor breakdown by category
    const contractorByCategory = new Map<string, Map<string, number>>(); // contractorId -> categoryId -> qty
    const contractorByObject = new Map<string, Map<string, number>>(); // contractorId -> objectId -> qty
    for (const issue of data.issues) {
      if (issue.status !== 'confirmed') continue;
      const items = data.issueItems.filter((i) => i.warehouse_issue_id === issue.id);
      for (const item of items) {
        const mat = materialMap.get(item.material_id);
        if (!mat) continue;
        const catId = mat.category_id || 'uncategorized';
        const catMap = contractorByCategory.get(issue.contractor_id) || new Map();
        catMap.set(catId, (catMap.get(catId) || 0) + item.quantity);
        contractorByCategory.set(issue.contractor_id, catMap);

        const objMap = contractorByObject.get(issue.contractor_id) || new Map();
        objMap.set(item.object_id, (objMap.get(item.object_id) || 0) + item.quantity);
        contractorByObject.set(issue.contractor_id, objMap);
      }
    }

    return {
      deficits, unprocured, inTransit,
      totalMaterials: data.materials.length,
      totalObjects: data.objects.length,
      totalRequired: [...requiredByMaterial.values()].reduce((a, b) => a + b, 0),
      totalOrdered: [...orderedByMaterial.values()].reduce((a, b) => a + b, 0),
      totalReceived: [...receivedByMaterial.values()].reduce((a, b) => a + b, 0),
      totalIssued: [...issuedByMaterial.values()].reduce((a, b) => a + b, 0),
      materialMap, objectMap, contractorMap, categoryMap,
      contractorByCategory, contractorByObject,
    };
  }, [data]);

  const handleExportDeficits = () => {
    const rows = stats.deficits.map((d) => ({
      'Наименование': d.material, 'Артикул': d.article, 'Ед. изм.': d.unit,
      'Потребность': d.required, 'Заказано': d.ordered, 'Дефицит': d.deficit, 'На складе': d.onHand,
    }));
    exportToExcel(rows, 'Дефициты', 'deficity');
  };

  const handleExportDeficitsPDF = () => {
    const headers = ['Наименование', 'Артикул', 'Ед.', 'Потребность', 'Заказано', 'Дефицит', 'На складе'];
    const body = stats.deficits.map((d) => [d.material, d.article, d.unit, d.required, d.ordered, d.deficit, d.onHand]);
    exportToPDF('Дефицит материалов', headers, body, 'deficity');
  };

  if (loading) return <LoadingSpinner />;

  const statCards = [
    { label: 'Всего материалов', value: stats.totalMaterials, icon: Package, color: 'text-blue-600 bg-blue-50', drill: null },
    { label: 'Объектов', value: stats.totalObjects, icon: Warehouse, color: 'text-emerald-600 bg-emerald-50', drill: { type: 'objects', title: 'Объекты трассы' } },
    { label: 'Не закуплено', value: stats.unprocured.length, icon: ShoppingCart, color: 'text-red-600 bg-red-50', drill: { type: 'unprocured', title: 'Не закупленные материалы' } },
    { label: 'В работе (закупки)', value: stats.inTransit.length, icon: TrendingDown, color: 'text-amber-600 bg-amber-50', drill: { type: 'intransit', title: 'Заявки в работе' } },
  ];

  // Build drill-down content
  const renderDrillDown = () => {
    if (!drillDown) return null;
    const { type, title } = drillDown;

    if (type === 'objects') {
      return (
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase"><th className="text-left px-3 py-2">№</th><th className="text-left px-3 py-2">Тип</th><th className="text-left px-3 py-2">Название</th><th className="text-left px-3 py-2">Код</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {[...data.objects].sort((a, b) => a.sequence_order - b.sequence_order).map((o, i) => (
              <tr key={o.id}><td className="px-3 py-2 text-slate-400 text-xs">{i + 1}</td><td className="px-3 py-2"><Badge>{OBJECT_TYPE_LABELS[o.type]}</Badge></td><td className="px-3 py-2 text-slate-800 font-medium">{o.name}</td><td className="px-3 py-2 text-slate-500 text-xs">{o.code || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (type === 'unprocured') {
      return (
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase"><th className="text-left px-3 py-2">Материал</th><th className="text-left px-3 py-2">Артикул</th><th className="text-right px-3 py-2">Потребность</th><th className="text-right px-3 py-2">На складе</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {stats.unprocured.map((d, i) => (
              <tr key={i}><td className="px-3 py-2 text-slate-800 font-medium">{d.material}</td><td className="px-3 py-2 text-slate-500 text-xs">{d.article}</td><td className="px-3 py-2 text-right text-slate-700">{d.required}</td><td className="px-3 py-2 text-right text-slate-600">{d.onHand}</td></tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (type === 'intransit') {
      return (
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase"><th className="text-left px-3 py-2">Материал</th><th className="text-right px-3 py-2">Кол-во</th><th className="text-left px-3 py-2">Статус</th><th className="text-left px-3 py-2">Дата</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {stats.inTransit.map((pr) => (
              <tr key={pr.id}><td className="px-3 py-2 text-slate-800 font-medium">{stats.materialMap.get(pr.material_id)?.name || '—'}</td><td className="px-3 py-2 text-right text-slate-700">{pr.total_quantity}</td><td className="px-3 py-2"><Badge color={PR_STATUS_COLORS[pr.status]}>{PR_STATUS_LABELS[pr.status]}</Badge></td><td className="px-3 py-2 text-slate-500 text-xs">{new Date(pr.request_date).toLocaleDateString('ru-RU')}</td></tr>
            ))}
          </tbody>
        </table>
      );
    }

    if (type === 'contractor') {
      const contractorId = drillDown.contractorId || '';
      const catMap = stats.contractorByCategory.get(contractorId) || new Map();
      const objMap = stats.contractorByObject.get(contractorId) || new Map();
      return (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">По категориям</h3>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase"><th className="text-left px-3 py-2">Категория</th><th className="text-right px-3 py-2">Выдано</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...catMap.entries()].map(([catId, qty]) => (
                  <tr key={catId}><td className="px-3 py-2 text-slate-800">{catId === 'uncategorized' ? 'Без категории' : stats.categoryMap.get(catId)?.name || '—'}</td><td className="px-3 py-2 text-right text-slate-700 font-semibold">{qty}</td></tr>
                ))}
                {catMap.size === 0 && <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400 text-sm">Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">По объектам</h3>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase"><th className="text-left px-3 py-2">Объект</th><th className="text-right px-3 py-2">Выдано</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {[...objMap.entries()].map(([objId, qty]) => (
                  <tr key={objId}><td className="px-3 py-2 text-slate-800">{stats.objectMap.get(objId)?.name || '—'}</td><td className="px-3 py-2 text-right text-slate-700 font-semibold">{qty}</td></tr>
                ))}
                {objMap.size === 0 && <tr><td colSpan={2} className="px-3 py-4 text-center text-slate-400 text-sm">Нет данных</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <PageContainer>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              onClick={() => s.drill && setDrillDown({ type: s.drill.type, title: s.drill.title })}
              className="text-left"
            >
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-800">{s.value}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      {s.label}
                      {s.drill && <ChevronRight className="w-3 h-3" />}
                    </div>
                  </div>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
          <div><div className="text-xs text-slate-500 mb-1">Потребность (всего)</div><div className="text-xl font-bold text-slate-800">{stats.totalRequired.toLocaleString('ru-RU')}</div></div>
          <div><div className="text-xs text-slate-500 mb-1">Заказано</div><div className="text-xl font-bold text-blue-600">{stats.totalOrdered.toLocaleString('ru-RU')}</div></div>
          <div><div className="text-xs text-slate-500 mb-1">Получено на склад</div><div className="text-xl font-bold text-emerald-600">{stats.totalReceived.toLocaleString('ru-RU')}</div></div>
          <div><div className="text-xs text-slate-500 mb-1">Выдано подрядчикам</div><div className="text-xl font-bold text-amber-600">{stats.totalIssued.toLocaleString('ru-RU')}</div></div>
        </div>
      </Card>

      {/* Contractor breakdown */}
      <Card>
        <CardHeader title="Выдача подрядчикам" subtitle="Нажмите на подрядчика для разбивки по категориям и объектам" />
        {data.contractors.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">Подрядчиков нет</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.contractors.map((c) => {
              const catMap = stats.contractorByCategory.get(c.id) || new Map();
              const objMap = stats.contractorByObject.get(c.id) || new Map();
              const totalQty = [...catMap.values()].reduce((a, b) => a + b, 0);
              return (
                <button
                  key={c.id}
                  onClick={() => setDrillDown({ type: 'contractor', title: c.name, contractorId: c.id })}
                  className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">{c.name}</div>
                    <div className="text-xs text-slate-400">
                      {objMap.size} объектов · {catMap.size} категорий
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-700">{totalQty}</div>
                    <div className="text-xs text-slate-400">всего выдано</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Дефицит материалов"
          subtitle="Потребность больше, чем заказано — нужно дозакупить"
          action={
            <div className="flex gap-2">
              <button onClick={handleExportDeficits} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium">Excel</button>
              <button onClick={handleExportDeficitsPDF} className="px-3 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium">PDF</button>
            </div>
          }
        />
        {stats.deficits.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-green-500" />
            Дефицитов нет — всё заказано
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                  <th className="text-left px-4 py-2.5 font-medium">Артикул</th>
                  <th className="text-right px-4 py-2.5 font-medium">Потребность</th>
                  <th className="text-right px-4 py-2.5 font-medium">Заказано</th>
                  <th className="text-right px-4 py-2.5 font-medium">Дефицит</th>
                  <th className="text-right px-4 py-2.5 font-medium">На складе</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.deficits.slice(0, 20).map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800">{d.material}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{d.article}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{d.required.toLocaleString('ru-RU')}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{d.ordered.toLocaleString('ru-RU')}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <ArrowDownRight className="w-3.5 h-3.5" />{d.deficit.toLocaleString('ru-RU')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{d.onHand.toLocaleString('ru-RU')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.deficits.length > 20 && (
              <div className="p-3 text-center text-xs text-slate-400">Показано 20 из {stats.deficits.length}. Экспорт выгрузит все.</div>
            )}
          </div>
        )}
      </Card>

      {/* Drill-down modal */}
      <Modal open={!!drillDown} onClose={() => setDrillDown(null)} title={drillDown?.title || ''} wide>
        {renderDrillDown()}
      </Modal>
    </PageContainer>
  );
}
