import { Building2, GitBranch, Route, Gauge, Signal, Radio, Waypoints, CircleDot, type LucideIcon } from 'lucide-react';
import type { ObjectType } from '@/lib/types';

export const TYPE_ICONS: Record<ObjectType, LucideIcon> = {
  station: Building2,
  crossover: GitBranch,
  stretch: Route,
  maps: Gauge,
  ms: Signal,
  ktsm: Radio,
  crossing: Waypoints,
  other: CircleDot,
};

export const TYPE_ABBREVIATIONS: Record<ObjectType, string> = {
  station: 'СТ',
  crossover: 'РЗД',
  stretch: 'ПГ',
  maps: 'МАПС',
  ms: 'МС',
  ktsm: 'КТСМ',
  crossing: 'ПЕР',
  other: 'ПР',
};

export const TYPE_COLORS: Record<ObjectType, string> = {
  station: 'bg-blue-100 text-blue-700',
  crossover: 'bg-amber-100 text-amber-700',
  stretch: 'bg-emerald-100 text-emerald-700',
  maps: 'bg-sky-100 text-sky-700',
  ms: 'bg-orange-100 text-orange-700',
  ktsm: 'bg-rose-100 text-rose-700',
  crossing: 'bg-lime-100 text-lime-700',
  other: 'bg-slate-200 text-slate-700',
};
