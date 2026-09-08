import { useState, useMemo } from 'react';
import { Users, CheckCircle, Clock, Download, Package, MapPin, AlertTriangle, Truck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useData } from '@/lib/useData';
import { Card, CardHeader, Button, Select, Badge, Modal, Input, PageContainer, LoadingSpinner, EmptyState } from '@/components/ui';
import { exportToExcel } from '@/lib/export';
import { ISSUE_STATUS_LABELS, ISSUE_STATUS_COLORS, type WarehouseIssueStatus } from '@/lib/types';

const FORCED_REASONS = [
  'Нет на складе',
  'Ещё не приехала',
  'Не влезла в транспорт',
  'Заберу позже',
  'Брак / повреждено',
  'Другое',
];

export default function ContractorPortal() {
  const { data, loading, refresh } = useData();
  const [selectedContractor, setSelectedContractor] = useState('');
  const [receiptModalOpen, setReceiptModalOpen] = useState<string | null>(null);
  const [receiptRows, setReceiptRows] = useState<{ item_id: string; material_id: string; object_id: string; ordered: number; received: string; reason: string }[]>([]);

  const materialMap = useMemo(() => new Map(data.materials.map((m) => [m.id, m])), [data.materials]);
  const objectMap = useMemo(() => new Map(data.objects.map((o) => [o.id, o])), [data.objects]);

  const contractorObjIds = useMemo(() => {
    if (!selectedContractor) return [];
    return data.contractorObjects.filter((co) => co.contractor_id === selectedContractor).map((co) => co.object_id);
  }, [selectedContractor, data.contractorObjects]);

  const contractorRequirements = useMemo(() => {
    if (!selectedContractor) return [];
    return data.requirements.filter((r) => contractorObjIds.includes(r.object_id));
  }, [selectedContractor, data.requirements, contractorObjIds]);

  const issuedByMaterialObject = useMemo(() => {
    const map = new Map<string, number>();
    const confirmedIssues = data.issues.filter((i) => i.contractor_id === selectedContractor && i.status === 'confirmed');
    const confirmedIds = new Set(confirmedIssues.map((i) => i.id));
    for (const item of data.issueItems) {
      if (confirmedIds.has(item.warehouse_issue_id)) {
        const key = `${item.material_id}|${item.object_id}`;
        map.set(key, (map.get(key) || 0) + item.quantity);
      }
    }
    return map;
  }, [selectedContractor, data.issues, data.issueItems]);

  const plannedByMaterialObject = useMemo(() => {
    const map = new Map<string, number>();
    const plannedIssues = data.issues.filter((i) => i.contractor_id === selectedContractor && i.status === 'planned');
    const plannedIds = new Set(plannedIssues.map((i) => i.id));
    for (const item of data.issueItems) {
      if (plannedIds.has(item.warehouse_issue_id)) {
        const key = `${item.material_id}|${item.object_id}`;
        map.set(key, (map.get(key) || 0) + item.quantity);
      }
    }
    return map;
  }, [selectedContractor, data.issues, data.issueItems]);

  // Receipts (partial) by issue item
  const receiptsByItem = useMemo(() => {
    const map = new Map<string, { received: number; reason: string | null }>();
    for (const r of data.issueReceipts) {
      const existing = map.get(r.warehouse_issue_item_id);
      if (existing) {
        map.set(r.warehouse_issue_item_id, { received: existing.received + r.received_quantity, reason: r.reason });
      } else {
        map.set(r.warehouse_issue_item_id, { received: r.received_quantity, reason: r.reason });
      }
    }
    return map;
  }, [data.issueReceipts]);

  const takeInfo = useMemo(() => {
    const rows: { material: string; article: string; unit: string; object: string; required: number; issued: number; planned: number; remaining: number }[] = [];
    for (const req of contractorRequirements) {
      const mat = materialMap.get(req.material_id);
      const obj = objectMap.get(req.object_id);
      if (!mat || !obj) continue;
      const key = `${req.material_id}|${req.object_id}`;
      const issued = issuedByMaterialObject.get(key) || 0;
      const planned = plannedByMaterialObject.get(key) || 0;
      rows.push({ material: mat.name, article: mat.article || '', unit: mat.unit, object: obj.name, required: req.quantity, issued, planned, remaining: req.quantity - issued - planned });
    }
    return rows.sort((a, b) => a.material.localeCompare(b.material));
  }, [contractorRequirements, materialMap, objectMap, issuedByMaterialObject, plannedByMaterialObject]);

  const contractorIssues = useMemo(() => {
    if (!selectedContractor) return [];
    return data.issues.filter((i) => i.contractor_id === selectedContractor).sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  }, [selectedContractor, data.issues]);

  const itemsByIssue = useMemo(() => {
    const map = new Map<string, typeof data.issueItems>();
    for (const item of data.issueItems) {
      const arr = map.get(item.warehouse_issue_id) || [];
      arr.push(item);
      map.set(item.warehouse_issue_id, arr);
    }
    return map;
  }, [data.issueItems]);

  const handleConfirmIssue = async (issueId: string) => {
    await supabase.from('warehouse_issues').update({ status: 'confirmed' }).eq('id', issueId);
    await refresh();
  };

  // Partial receipt modal
  const openReceiptModal = (issueId: string) => {
    const issueItems = itemsByIssue.get(issueId) || [];
    setReceiptRows(issueItems.map((it) => ({
      item_id: it.id,
      material_id: it.material_id,
      object_id: it.object_id,
      ordered: it.quantity,
      received: '',
      reason: '',
    })));
    setReceiptModalOpen(issueId);
  };

  const handleReceiptSubmit = async () => {
    if (!receiptModalOpen) return;
    const issueId = receiptModalOpen;
    for (const row of receiptRows) {
      const receivedQty = parseFloat(row.received) || 0;
      if (receivedQty === 0 && !row.reason) continue;
      await supabase.from('warehouse_issue_receipts').insert({
        warehouse_issue_id: issueId,
        warehouse_issue_item_id: row.item_id,
        material_id: row.material_id,
        object_id: row.object_id,
        ordered_quantity: row.ordered,
        received_quantity: receivedQty,
        reason: receivedQty < row.ordered ? (row.reason || 'Не указано') : null,
      });
    }
    // If all items received fully, mark issue as confirmed
    const allFullyReceived = receiptRows.every((r) => parseFloat(r.received) >= r.ordered);
    if (allFullyReceived) {
      await supabase.from('warehouse_issues').update({ status: 'confirmed' }).eq('id', issueId);
    }
    setReceiptModalOpen(null);
    await refresh();
  };

  const handleExport = () => {
    const rows = takeInfo.map((r) => ({
      'Материал': r.material, 'Артикул': r.article, 'Ед. изм.': r.unit, 'Объект': r.object,
      'Потребность': r.required, 'Выдано': r.issued, 'Запланировано': r.planned, 'Осталось забрать': r.remaining,
    }));
    exportToExcel(rows, 'Кабинет подрядчика', 'podryadchik');
  };

  if (loading) return <LoadingSpinner />;

  return (
    <PageContainer>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-500">Выберите себя из списка:</span>
        </div>
        {selectedContractor && (
          <Button onClick={handleExport} variant="secondary" size="sm">
            <Download className="w-4 h-4" /> Excel
          </Button>
        )}
      </div>

      <Card className="p-4">
        <Select value={selectedContractor} onChange={setSelectedContractor}
          options={data.contractors.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="— Выбрать подрядчика —" className="max-w-md" />
      </Card>

      {!selectedContractor ? (
        <Card><EmptyState icon={Users} message="Выберите подрядчика, чтобы увидеть доступные материалы" /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><MapPin className="w-5 h-5 text-blue-600" /></div>
                <div><div className="text-2xl font-bold text-slate-800">{contractorObjIds.length}</div><div className="text-xs text-slate-500">Объектов</div></div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center"><CheckCircle className="w-5 h-5 text-emerald-600" /></div>
                <div><div className="text-2xl font-bold text-slate-800">{takeInfo.filter((r) => r.remaining > 0).length}</div><div className="text-xs text-slate-500">Можно забрать</div></div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
                <div><div className="text-2xl font-bold text-slate-800">{contractorIssues.filter((i) => i.status === 'planned').length}</div><div className="text-xs text-slate-500">Запланировано</div></div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center"><Package className="w-5 h-5 text-slate-600" /></div>
                <div><div className="text-2xl font-bold text-slate-800">{contractorIssues.filter((i) => i.status === 'confirmed').length}</div><div className="text-xs text-slate-500">Получено</div></div>
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Что можно забрать" subtitle="Материалы по объектам, доступные для получения" />
            {takeInfo.length === 0 ? (
              <EmptyState icon={Package} message="Нет назначенных объектов или потребностей" />
            ) : (
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 font-medium">Материал</th>
                      <th className="text-left px-4 py-2.5 font-medium">Объект</th>
                      <th className="text-right px-4 py-2.5 font-medium">Потребность</th>
                      <th className="text-right px-4 py-2.5 font-medium">Выдано</th>
                      <th className="text-right px-4 py-2.5 font-medium">Запланировано</th>
                      <th className="text-right px-4 py-2.5 font-medium">Осталось</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {takeInfo.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-800 font-medium">{r.material}</td>
                        <td className="px-4 py-2.5 text-slate-600">{r.object}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{r.required}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{r.issued}</td>
                        <td className="px-4 py-2.5 text-right text-slate-700">{r.planned}</td>
                        <td className="px-4 py-2.5 text-right">
                          {r.remaining > 0 ? <span className="text-emerald-600 font-semibold">{r.remaining}</span>
                          : r.remaining < 0 ? <span className="text-red-600 font-semibold flex items-center justify-end gap-1"><AlertTriangle className="w-3.5 h-3.5" />{r.remaining}</span>
                          : <span className="text-slate-400">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="История выдач" subtitle="Запланированные и подтверждённые выдачи" />
            {contractorIssues.length === 0 ? (
              <EmptyState icon={Truck} message="Выдач не было" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 font-medium">Дата</th>
                      <th className="text-center px-4 py-2.5 font-medium">Позиций</th>
                      <th className="text-left px-4 py-2.5 font-medium">Статус</th>
                      <th className="text-right px-4 py-2.5 font-medium">Действие</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {contractorIssues.map((issue) => {
                      const items = itemsByIssue.get(issue.id) || [];
                      return (
                        <tr key={issue.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{new Date(issue.issue_date).toLocaleDateString('ru-RU')}</td>
                          <td className="px-4 py-2.5 text-center text-slate-600">{items.length}</td>
                          <td className="px-4 py-2.5"><Badge color={ISSUE_STATUS_COLORS[issue.status]}>{ISSUE_STATUS_LABELS[issue.status]}</Badge></td>
                          <td className="px-4 py-2.5 text-right">
                            {issue.status === 'planned' && (
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="secondary" onClick={() => openReceiptModal(issue.id)}>
                                  <Package className="w-3.5 h-3.5" /> Принять с проверкой
                                </Button>
                                <Button size="sm" onClick={() => handleConfirmIssue(issue.id)}>
                                  <CheckCircle className="w-3.5 h-3.5" /> Получено полностью
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Partial receipt modal */}
      <Modal open={!!receiptModalOpen} onClose={() => setReceiptModalOpen(null)} title="Приёмка материалов" wide>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              Укажите фактически полученное количество по каждой позиции. Если получено меньше заказанного — выберите причину. Позиции, которые не получены, оставьте с нулём и укажите причину.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                  <th className="text-left px-3 py-2 font-medium">Материал</th>
                  <th className="text-left px-3 py-2 font-medium">Объект</th>
                  <th className="text-right px-3 py-2 font-medium">Заказано</th>
                  <th className="text-right px-3 py-2 font-medium">Получено</th>
                  <th className="text-left px-3 py-2 font-medium">Причина (если не полностью)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receiptRows.map((row, idx) => {
                  const mat = materialMap.get(row.material_id);
                  const obj = objectMap.get(row.object_id);
                  const received = parseFloat(row.received) || 0;
                  const isPartial = received > 0 && received < row.ordered;
                  const isMissing = received === 0;
                  return (
                    <tr key={idx} className={isPartial ? 'bg-amber-50' : isMissing ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 text-slate-800 font-medium text-xs">{mat?.name || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 text-xs">{obj?.name || '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700 text-xs">{row.ordered}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          value={row.received}
                          onChange={(e) => { const c = [...receiptRows]; c[idx].received = e.target.value; setReceiptRows(c); }}
                          placeholder="0"
                          className="w-20 px-2 py-1 rounded border border-slate-300 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={row.reason}
                          onChange={(e) => { const c = [...receiptRows]; c[idx].reason = e.target.value; setReceiptRows(c); }}
                          disabled={received >= row.ordered}
                          className="w-full px-2 py-1 rounded border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                        >
                          <option value="">—</option>
                          {FORCED_REASONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setReceiptModalOpen(null)}>Отмена</Button>
            <Button onClick={handleReceiptSubmit}>Подтвердить приёмку</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
