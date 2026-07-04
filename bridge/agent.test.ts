import { describe, it, expect } from 'vitest';
import { composePrompt, commandFor, extractGroupingJson } from './agent';

const grouping = {
  intent: 'Adds a widget.',
  changeType: 'feature',
  groups: [
    { id: 'g1', title: 'W', label: 'behavioral', rationale: 'r', files: ['a.ts'] },
  ],
  readingOrder: [{ groupId: 'g1', reason: 'only' }],
};
const groupingJson = JSON.stringify(grouping);

describe('composePrompt', () => {
  it('joins system and user content and demands bare JSON', () => {
    const prompt = composePrompt([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'USER' },
    ]);
    expect(prompt).toContain('SYS\n\nUSER');
    expect(prompt).toContain('ONLY the grouping JSON');
  });
});

describe('commandFor', () => {
  it('runs claude headless with the prompt on stdin', () => {
    const cmd = commandFor('claude', 'P');
    expect(cmd.argv).toEqual(['claude', '-p', '--output-format', 'json']);
    expect(cmd.stdin).toBe('P');
  });

  it('runs codex exec with the prompt as an argument', () => {
    const cmd = commandFor('codex', 'P');
    expect(cmd.argv[0]).toBe('codex');
    expect(cmd.argv).toContain('exec');
    expect(cmd.argv.at(-1)).toBe('P');
    expect(cmd.stdin).toBeUndefined();
  });
});

describe('extractGroupingJson', () => {
  it('accepts raw grouping JSON', () => {
    expect(JSON.parse(extractGroupingJson(groupingJson))).toEqual(grouping);
  });

  it('unwraps the claude -p json envelope', () => {
    const envelope = JSON.stringify({
      type: 'result',
      result: '```json\n' + groupingJson + '\n```',
    });
    expect(JSON.parse(extractGroupingJson(envelope))).toEqual(grouping);
  });

  it('finds the JSON embedded in free-form codex output', () => {
    const stdout = `thinking...\nHere you go:\n${groupingJson}\nDone. {"not":"it"}`;
    expect(JSON.parse(extractGroupingJson(stdout))).toEqual(grouping);
  });

  it('handles braces inside string values', () => {
    const tricky = JSON.stringify({
      ...grouping,
      intent: 'Uses {curly} braces and a " quote \\ escape.',
    });
    const out = extractGroupingJson(`noise ${tricky} noise`);
    expect(JSON.parse(out).intent).toContain('{curly}');
  });

  it('throws when no grouping JSON is present', () => {
    expect(() => extractGroupingJson('no json here {"a":1}')).toThrow(
      /no grouping JSON/,
    );
  });
});
