/**
 * Pack loader — plain objects + extends/merge.
 * Not a class framework. Later mods override only the fields they change.
 */
import raw from './pack.json';

function clone(v) {
  return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
}

export function deepMerge(base, over) {
  if (over === undefined) return clone(base);
  if (
    base === null ||
    over === null ||
    typeof base !== 'object' ||
    typeof over !== 'object' ||
    Array.isArray(base) ||
    Array.isArray(over)
  ) {
    return clone(over);
  }
  const out = clone(base);
  for (const key of Object.keys(over)) {
    if (key === 'extends') continue;
    out[key] = key in base ? deepMerge(base[key], over[key]) : clone(over[key]);
  }
  return out;
}

export function resolveList(list) {
  const entries = list || [];
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  const memo = {};

  const resolve = (id, stack = []) => {
    if (memo[id]) return memo[id];
    const rawEntry = byId[id];
    if (!rawEntry) throw new Error(`Unknown pack entry: ${id}`);
    if (stack.includes(id)) {
      throw new Error(`Pack cycle: ${[...stack, id].join(' -> ')}`);
    }
    const parent = rawEntry.extends ? resolve(rawEntry.extends, [...stack, id]) : {};
    const merged = deepMerge(parent, rawEntry);
    memo[id] = merged;
    return merged;
  };

  return entries.map((e) => resolve(e.id));
}

export function loadPack(json) {
  const vehicles = resolveList(json.vehicles);
  const parts = resolveList(json.parts);
  const props = resolveList(json.props);
  const pois = resolveList(json.pois);
  const events = resolveList(json.events);
  return {
    id: json.id,
    name: json.name,
    world: json.world || { block: 52, grid: 10, trafficCount: 28, fog: 0.0062 },
    vehicles,
    parts,
    props,
    pois,
    events,
    vehiclesById: Object.fromEntries(vehicles.map((v) => [v.id, v])),
    partsById: Object.fromEntries(parts.map((p) => [p.id, p])),
    propsById: Object.fromEntries(props.map((p) => [p.id, p])),
    poisById: Object.fromEntries(pois.map((p) => [p.id, p])),
    eventsById: Object.fromEntries(events.map((e) => [e.id, e])),
  };
}

export function partsOf(pack, type) {
  return pack.parts.filter((p) => p.type === type);
}

export const pack = loadPack(raw);
