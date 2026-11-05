import type { DbObject } from '@/lib/types';

export function sortBySequence(objects: DbObject[]): DbObject[] {
  return [...objects].sort((a, b) => a.sequence_order - b.sequence_order);
}

export function getMainObjects(objects: DbObject[]): DbObject[] {
  return sortBySequence(objects.filter((o) => o.parent_id === null));
}

export function buildChildrenMap(objects: DbObject[]): Map<string, DbObject[]> {
  const map = new Map<string, DbObject[]>();
  for (const obj of sortBySequence(objects)) {
    if (!obj.parent_id) continue;
    const list = map.get(obj.parent_id) || [];
    list.push(obj);
    map.set(obj.parent_id, list);
  }
  return map;
}

export function getOwningObjectId(obj: DbObject): string {
  return obj.parent_id ?? obj.id;
}

export function getObjectLabel(obj: DbObject, objectMap: Map<string, DbObject>): string {
  const parent = obj.parent_id ? objectMap.get(obj.parent_id) : undefined;
  return parent ? `${parent.name} · ${obj.name}` : obj.name;
}
