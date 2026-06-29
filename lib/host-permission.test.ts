import { describe, it, expect } from 'vitest';
import { originPattern } from './host-permission';

describe('originPattern', () => {
  it('derives an origin match pattern from a base URL', () => {
    expect(originPattern('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/*',
    );
    expect(originPattern('http://localhost:1234/v1')).toBe(
      'http://localhost:1234/*',
    );
  });

  it('returns null for an invalid URL', () => {
    expect(originPattern('not a url')).toBeNull();
    expect(originPattern('')).toBeNull();
  });
});
