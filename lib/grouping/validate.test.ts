import { describe, it, expect } from 'vitest';
import { parseGroupingResponse, GroupingValidationError } from './validate';

const valid = {
  intent: 'Adds rate limiting to the auth endpoint.',
  changeType: 'feature',
  groups: [
    {
      id: 'g1',
      title: 'Rate limiter',
      label: 'behavioral',
      rationale: 'New limiter middleware.',
      files: ['src/limiter.ts'],
    },
    {
      id: 'g2',
      title: 'Tests',
      label: 'test',
      rationale: 'Covers the limiter.',
      files: ['src/limiter.test.ts'],
    },
  ],
  readingOrder: [
    { groupId: 'g1', reason: 'Start with the new behavior.' },
    { groupId: 'g2', reason: 'Then confirm it is tested.' },
  ],
};

describe('parseGroupingResponse', () => {
  it('parses a valid response', () => {
    const result = parseGroupingResponse(JSON.stringify(valid));
    expect(result.changeType).toBe('feature');
    expect(result.groups).toHaveLength(2);
    expect(result.readingOrder[0]?.groupId).toBe('g1');
  });

  it('rejects non-JSON', () => {
    expect(() => parseGroupingResponse('not json')).toThrow(
      GroupingValidationError,
    );
  });

  it('rejects an invalid label', () => {
    const bad = structuredClone(valid);
    bad.groups[0]!.label = 'nonsense';
    expect(() => parseGroupingResponse(JSON.stringify(bad))).toThrow(/label/);
  });

  it('rejects a reading order referencing an unknown group', () => {
    const bad = structuredClone(valid);
    bad.readingOrder[0]!.groupId = 'ghost';
    expect(() => parseGroupingResponse(JSON.stringify(bad))).toThrow(/unknown group/);
  });

  it('rejects unusable file entries', () => {
    const bad = JSON.parse(JSON.stringify(valid));
    bad.groups[0].files = [123];
    expect(() => parseGroupingResponse(JSON.stringify(bad))).toThrow(/files/);
  });

  it('coerces files given as {path} objects', () => {
    const variant = JSON.parse(JSON.stringify(valid));
    variant.groups[0].files = [{ path: 'src/limiter.ts' }, { filename: 'a.ts' }];
    const result = parseGroupingResponse(JSON.stringify(variant));
    expect(result.groups[0]?.files).toEqual(['src/limiter.ts', 'a.ts']);
  });

  it('coerces files given as a delimited string', () => {
    const variant = JSON.parse(JSON.stringify(valid));
    variant.groups[0].files = 'src/a.ts, src/b.ts';
    const result = parseGroupingResponse(JSON.stringify(variant));
    expect(result.groups[0]?.files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('attaches the raw text to validation errors', () => {
    try {
      parseGroupingResponse('{not json');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(GroupingValidationError);
      expect((err as GroupingValidationError).raw).toBe('{not json');
    }
  });
});
