import type { Session, Tracker } from './types';
export function trackerCapabilities(session: Session | undefined, generation: number) {
  const rpc = session?.['rpc-version'];
  return {
    generation,
    state: rpc === undefined ? 'unknown' : rpc >= 17 ? 'full' : rpc === 16 ? 'url-only' : 'unknown',
  } as const;
}
export type TrackerEdit = { id?: number; announce: string; tier: number };
export function trackerSnapshot(rows: Tracker[] | undefined): Tracker[] {
  if (
    !Array.isArray(rows) ||
    rows.some(
      (x) => !Number.isInteger(x.id) || typeof x.announce !== 'string' || !Number.isInteger(x.tier),
    )
  )
    throw new Error('Tracker baseline unavailable; reload before editing');
  return rows.map(({ id, announce, tier }) => ({ id, announce, tier }));
}
export function trackerShape(rows: TrackerEdit[], identity = false) {
  const tiers = new Map<number, number>();
  return rows.map((x) => {
    if (!tiers.has(x.tier)) tiers.set(x.tier, tiers.size);
    return [...(identity ? [x.id] : []), x.announce, tiers.get(x.tier)];
  });
}
export function sameTrackers(a: TrackerEdit[], b: TrackerEdit[], identity = false) {
  return JSON.stringify(trackerShape(a, identity)) === JSON.stringify(trackerShape(b, identity));
}
export function trackerPatch(
  before: Tracker[],
  after: TrackerEdit[],
  capabilities: ReturnType<typeof trackerCapabilities>,
): Record<string, unknown> {
  if (capabilities.state === 'unknown')
    throw new Error('Tracker capability unavailable; reconnect and reload');
  const urls = new Map<string, number>();
  const originalCounts = new Map<string, number>();
  for (const row of before)
    originalCounts.set(row.announce, (originalCounts.get(row.announce) ?? 0) + 1);
  const members = new Set<number>();
  for (const row of after) {
    if (!Number.isInteger(row.tier) || row.tier < 0) throw new Error('Invalid Tracker group');
    if (row.id !== undefined && !before.some((x) => x.id === row.id))
      throw new Error('Unknown Tracker member');
    if (row.id !== undefined && members.has(row.id)) throw new Error('Unknown Tracker member');
    if (row.id !== undefined) members.add(row.id);
    const unchanged = before.some((x) => x.id === row.id && x.announce === row.announce);
    if (!unchanged) {
      try {
        const url = new URL(row.announce);
        if (!['http:', 'https:', 'udp:'].includes(url.protocol) || !url.hostname) throw new Error();
      } catch {
        throw new Error('Tracker URL must use http, https or udp');
      }
    }
    const count = (urls.get(row.announce) ?? 0) + 1;
    if (count > 1 && count > (originalCounts.get(row.announce) ?? 0))
      throw new Error('Duplicate Tracker URL');
    urls.set(row.announce, count);
  }
  if (sameTrackers(before, after, true)) return {};
  if (capabilities.state === 'url-only') {
    const retained = after.filter((x) => x.id !== undefined);
    const added = after.filter((x) => x.id === undefined);
    const removed = before.filter((x) => !retained.some((y) => y.id === x.id));
    const replaced = retained.filter(
      (x) => before.find((y) => y.id === x.id)!.announce !== x.announce,
    );
    const ordered = before.filter((x) => retained.some((y) => y.id === x.id));
    if (
      retained.some((x, i) => x.id !== ordered[i]?.id || x.tier !== ordered[i]?.tier) ||
      [added.length, removed.length, replaced.length].filter(Boolean).length > 1
    )
      throw new Error('Grouping and mixed membership/URL edits are restricted on this connection');
    if (added.length) {
      const nextTier = before.length ? Math.max(...before.map((x) => x.tier)) + 1 : 0;
      if (
        after.some((x, i) =>
          i < before.length ? x.id !== before[i].id : x !== added[i - before.length],
        ) ||
        added.some((x, i) => x.tier !== nextTier + i)
      )
        throw new Error('New Trackers require separate appended groups on this connection');
      return { trackerAdd: added.map((x) => x.announce) };
    }
    if (removed.length) return { trackerRemove: removed.map((x) => x.id) };
    const trackerReplace = replaced.flatMap((x) => [x.id!, x.announce]);
    return trackerReplace.length ? { trackerReplace } : {};
  }
  const tiers = new Map<number, string[]>();
  for (const row of after) tiers.set(row.tier, [...(tiers.get(row.tier) ?? []), row.announce]);
  return { trackerList: [...tiers.values()].map((urls) => urls.join('\n')).join('\n\n') };
}
