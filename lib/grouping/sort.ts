import type { Group, Importance } from './types';

const RANK: Record<Importance, number> = { high: 0, medium: 1, low: 2 };

function rankOf(group: Group): number {
  // The mechanical bucket always sinks to the bottom, whatever its importance.
  if (group.label === 'mechanical') return RANK.low + 1;
  return RANK[group.importance ?? 'medium'];
}

/**
 * Groups sorted by importance (high first), mechanical last. The sort is
 * stable, so within a rank the model's original order is kept. Pure.
 */
export function sortGroupsByImportance(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => rankOf(a) - rankOf(b));
}
