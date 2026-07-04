import { describe, it, expect } from 'vitest';
import { sortGroupsByImportance } from './sort';
import type { Group } from './types';

function group(id: string, extra: Partial<Group> = {}): Group {
  return {
    id,
    title: id,
    label: 'behavioral',
    rationale: 'r',
    files: [],
    ...extra,
  };
}

describe('sortGroupsByImportance', () => {
  it('orders high before medium before low, mechanical always last', () => {
    const sorted = sortGroupsByImportance([
      group('mech', { label: 'mechanical', importance: 'high' }),
      group('low', { importance: 'low' }),
      group('high', { importance: 'high' }),
      group('med', { importance: 'medium' }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['high', 'med', 'low', 'mech']);
  });

  it('treats missing importance (older cached results) as medium, stably', () => {
    const sorted = sortGroupsByImportance([
      group('a'),
      group('b', { importance: 'medium' }),
      group('c', { importance: 'high' }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not mutate the input', () => {
    const input = [group('x', { importance: 'low' }), group('y', { importance: 'high' })];
    sortGroupsByImportance(input);
    expect(input.map((g) => g.id)).toEqual(['x', 'y']);
  });
});
