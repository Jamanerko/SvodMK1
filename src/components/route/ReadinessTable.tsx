import { Badge } from '@/components/ui';
import ProgressRing from '@/components/route/ProgressRing';
import { TYPE_ICONS } from '@/components/route/typeVisuals';
import { buildChildrenMap, getMainObjects } from '@/lib/objectTree';
import { OBJECT_TYPE_LABELS, type DbObject } from '@/lib/types';
import {
  COVERAGE_BADGE_COLORS,
  COVERAGE_LABELS,
  READINESS_TONE_LABELS,
  READINESS_TONE_STYLES,
  getReadinessTone,
  type Coverage,
} from '@/lib/readiness';

interface ReadinessTableProps {
  objects: DbObject[];
  matchIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  coverage: (obj: DbObject) => Coverage | undefined;
}

export default function ReadinessTable({ objects, matchIds, selectedId, onSelect, coverage }: ReadinessTableProps) {
  const childrenMap = buildChildrenMap(objects);
  const mains = getMainObjects(objects).filter(
    (m) => matchIds.has(m.id) || (childrenMap.get(m.id) || []).some((c) => matchIds.has(c.id)),
  );

  if (mains.length === 0) {
    return <div className="p-8 text-center text-sm text-slate-400">Нет объектов по выбранным фильтрам</div>;
  }

  const rows = mains.flatMap((m) => [
    { obj: m, isChild: false },
    ...(childrenMap.get(m.id) || []).filter((c) => matchIds.has(c.id)).map((c) => ({ obj: c, isChild: true })),
  ]);

  return (
    <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
            <th className="text-left px-4 py-2.5 font-medium">Объект</th>
            <th className="text-left px-4 py-2.5 font-medium">Тип</th>
            <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Привязка</th>
            <th className="text-left px-4 py-2.5 font-medium w-56">Готовность</th>
            <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Материалы</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ obj, isChild }) => {
            const tone = getReadinessTone(obj.progress_percent);
            const cov = coverage(obj);
            const Icon = TYPE_ICONS[obj.type];
            const parent = isChild ? objects.find((o) => o.id === obj.parent_id) : undefined;
            const dimmed = !matchIds.has(obj.id);
            return (
              <tr
                key={obj.id}
                onClick={() => onSelect(obj.id)}
                className={`cursor-pointer transition-colors hover:bg-slate-50 ${selectedId === obj.id ? 'bg-blue-50' : ''} ${dimmed ? 'opacity-50' : ''}`}
              >
                <td className={`px-4 py-3 ${isChild ? 'pl-10' : ''}`}>
                  <div className="flex items-center gap-2">
                    {isChild && <span className="w-3 h-px bg-slate-300 shrink-0" />}
                    <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className={isChild ? 'text-slate-700' : 'font-medium text-slate-800'}>{obj.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge>{OBJECT_TYPE_LABELS[obj.type]}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">{isChild ? parent?.name || '—' : 'Основной объект'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${READINESS_TONE_STYLES[tone].bar}`}
                        style={{ width: `${obj.progress_percent}%` }}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-semibold text-slate-700">{obj.progress_percent}%</span>
                  </div>
                  <div className={`mt-1 text-[11px] ${READINESS_TONE_STYLES[tone].text}`}>{READINESS_TONE_LABELS[tone]}</div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {cov ? (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COVERAGE_BADGE_COLORS[cov.status]}`}>
                        {COVERAGE_LABELS[cov.status]}
                      </span>
                      {cov.percent !== null && <span className="text-xs text-slate-500">{cov.percent}%</span>}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
