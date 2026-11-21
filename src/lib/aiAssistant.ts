import type { CachedData } from '@/lib/useData';
import { computeCoverage, getOverallProgress, getReadinessTone, READINESS_TONE_LABELS } from '@/lib/readiness';
import { getMainObjects, buildChildrenMap } from '@/lib/objectTree';
import { OBJECT_TYPE_LABELS } from '@/lib/types';

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const fmt = (n: number) => n.toLocaleString('ru-RU');

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

function buildProjectSummary(data: CachedData): string {
  const coverage = computeCoverage(data.objects, data.requirements, data.purchaseRequests, data.purchaseRequestItems, true);
  const progress = getOverallProgress(data.objects);

  let required = 0;
  let covered = 0;
  for (const c of coverage.values()) {
    required += c.required;
    covered += c.covered;
  }

  const shortage: string[] = [];
  for (const [objectId, c] of coverage) {
    if (c.status === 'full' || c.status === 'none') continue;
    const obj = data.objects.find((o) => o.id === objectId);
    if (obj) shortage.push(`${obj.name}: ${fmt(c.required - c.covered)} не обеспечено`);
  }

  return [
    `Общая готовность объектов: ${progress}%.`,
    `Материалы: обеспечено ${fmt(covered)} из ${fmt(required)}${required > 0 ? ` (${Math.round((covered / required) * 100)}%)` : ''}.`,
    `Заявок на закуп: ${data.purchaseRequests.length}, объектов: ${data.objects.length}, подрядчиков: ${data.contractors.length}.`,
    shortage.length > 0 ? `Дефицит по объектам: ${shortage.slice(0, 5).join('; ')}.` : 'Дефицита материалов нет.',
  ].join(' ');
}

interface MaterialRow {
  name: string;
  unit: string;
  required: number;
  covered: number;
  ordered: number;
  received: number;
}

function buildMaterialRows(data: CachedData): MaterialRow[] {
  const byId = new Map<string, MaterialRow>();
  const row = (materialId: string): MaterialRow | undefined => {
    const material = data.materials.find((m) => m.id === materialId);
    if (!material) return undefined;
    let r = byId.get(materialId);
    if (!r) {
      r = { name: material.name, unit: material.unit, required: 0, covered: 0, ordered: 0, received: 0 };
      byId.set(materialId, r);
    }
    return r;
  };

  for (const req of data.requirements) {
    const r = row(req.material_id);
    if (r) r.required += req.quantity;
  }
  const prById = new Map(data.purchaseRequests.map((p) => [p.id, p]));
  for (const item of data.purchaseRequestItems) {
    const pr = prById.get(item.purchase_request_id);
    if (!pr || pr.status === 'cancelled') continue;
    const r = row(pr.material_id);
    if (r) r.ordered += item.quantity;
  }
  for (const receipt of data.receipts) {
    const r = row(receipt.material_id);
    if (r) r.received += receipt.quantity;
  }
  return [...byId.values()];
}

function answerOverall(data: CachedData): string {
  return buildProjectSummary(data);
}

function answerShortage(data: CachedData): string {
  const rows = buildMaterialRows(data).filter((r) => r.required > r.ordered);
  if (rows.length === 0) return 'Дефицита нет: по всем материалам заказано не меньше потребности.';
  rows.sort((a, b) => b.required - b.ordered - (a.required - a.ordered));
  const lines = rows.slice(0, 10).map((r) => `${r.name}: не хватает ${fmt(r.required - r.ordered)} ${r.unit} (потребность ${fmt(r.required)}, заказано ${fmt(r.ordered)})`);
  return `Материалы с дефицитом (${rows.length}):\n${lines.join('\n')}`;
}

function answerReady(data: CachedData): string {
  const mains = getMainObjects(data.objects);
  if (mains.length === 0) return 'Объекты ещё не заведены.';
  const childrenMap = buildChildrenMap(data.objects);
  const lines = mains.map((m) => {
    const kids = childrenMap.get(m.id) || [];
    const suffix = kids.length > 0 ? ` · подобъектов: ${kids.length}` : '';
    return `${m.name} — ${m.progress_percent}% (${READINESS_TONE_LABELS[getReadinessTone(m.progress_percent)]})${suffix}`;
  });
  return `Готовность основных объектов (средняя: ${getOverallProgress(data.objects)}%):\n${lines.join('\n')}`;
}

function answerRequests(data: CachedData): string {
  if (data.purchaseRequests.length === 0) return 'Заявок на закуп пока нет.';
  const statusLabels: Record<string, string> = {
    draft: 'черновик', submitted: 'отправлена', accepted: 'принята', in_transit: 'в пути', delivered: 'доставлена', cancelled: 'отменена',
  };
  const byStatus = new Map<string, number>();
  for (const p of data.purchaseRequests) byStatus.set(p.status, (byStatus.get(p.status) || 0) + 1);
  const lines = [...byStatus.entries()].map(([status, count]) => `${statusLabels[status] ?? status}: ${count}`);
  return `Заявок всего: ${data.purchaseRequests.length}.\n${lines.join('\n')}`;
}

function answerObjectQuery(data: CachedData, query: string): string | null {
  const q = normalize(query);
  const obj = data.objects.find((o) => q.includes(normalize(o.name))) || data.objects.find((o) => o.code && q.includes(normalize(o.code)));
  if (!obj) return null;

  const childrenMap = buildChildrenMap(data.objects);
  const kids = childrenMap.get(obj.id) || [];
  const coverage = computeCoverage(data.objects, data.requirements, data.purchaseRequests, data.purchaseRequestItems, true).get(obj.id);

  const lines = [
    `Объект «${obj.name}» (${OBJECT_TYPE_LABELS[obj.type]}) — готовность ${obj.progress_percent}% (${READINESS_TONE_LABELS[getReadinessTone(obj.progress_percent)]}).`,
  ];
  if (kids.length > 0) {
    lines.push(`Подобъекты: ${kids.map((k) => `${k.name} (${OBJECT_TYPE_LABELS[k.type]}, ${k.progress_percent}%)`).join(', ')}.`);
  }
  if (coverage) {
    lines.push(`Материалы: обеспечено ${fmt(coverage.covered)} из ${fmt(coverage.required)}${coverage.percent !== null ? ` (${coverage.percent}%)` : ''} — ${coverage.status === 'full' ? 'полностью' : coverage.status === 'none' ? 'потребности нет' : 'частично'}.`);
  } else {
    lines.push('Материалы: потребность не заведена.');
  }
  return lines.join('\n');
}

function answerMaterialQuery(data: CachedData, query: string): string | null {
  const q = normalize(query);
  const material = data.materials.find((m) => q.includes(normalize(m.name)));
  if (!material) return null;

  const rows = buildMaterialRows(data).filter((r) => r.name === material.name);
  const row = rows[0];
  if (!row || row.required === 0) return `По материалу «${material.name}» потребность не заведена.`;
  return `Материал «${material.name}»:\nПотребность: ${fmt(row.required)} ${row.unit}\nЗаказано: ${fmt(row.ordered)} ${row.unit}\nПоступило на склад: ${fmt(row.received)} ${row.unit}\n${row.ordered >= row.required ? 'Заказы покрывают потребность.' : `Не хватает заказа: ${fmt(row.required - row.ordered)} ${row.unit}.`}`;
}

export function getAssistantResponse(data: CachedData, query: string): string {
  const q = normalize(query);
  if (!q.trim()) return 'Задайте вопрос — например: «какая готовность объектов?», «чего не хватает по материалам?», «статус заявок».';

  if (/^(привет|здравствуй|добрый|hello|hi)\b/.test(q)) {
    return `Здравствуйте! Я ИИ-помощник. ${buildProjectSummary(data)}\nСпросите про готовность, материалы, дефицит или заявки.`;
  }
  if (/(помощь|что ты умеешь|help|команды)/.test(q)) {
    return 'Я умею отвечать по данным вашего проекта:\n• «Общая сводка» — готовность и обеспеченность\n• «Готовность объектов» — прогресс по каждому объекту\n• «Чего не хватает» — дефицит материалов\n• Название объекта — детали по нему\n• Название материала — потребность и поставки\n• «Статус заявок» — закупки по статусам';
  }
  if (/(сводк|итог|общ|как дела|статус проекта)/.test(q)) return answerOverall(data);
  if (/(не хватает|дефицит|проблем|не обеспеч|недоста)/.test(q)) return answerShortage(data);
  if (/(готовност|прогресс|объекты|трасс)/.test(q)) return answerReady(data);
  if (/(заявк|закуп|заказ)/.test(q)) return answerRequests(data);

  return (
    answerObjectQuery(data, query) ??
    answerMaterialQuery(data, query) ??
    `Не нашёл точного ответа. ${buildProjectSummary(data)}\nУточните вопрос: например, назовите объект или материал, либо спросите «что ты умеешь».`
  );
}

export const ASSISTANT_SUGGESTIONS = ['Общая сводка', 'Готовность объектов', 'Чего не хватает по материалам?', 'Статус заявок'];
