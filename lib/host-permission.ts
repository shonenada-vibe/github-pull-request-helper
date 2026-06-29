/**
 * Build a host-permission match pattern (`<origin>/*`) for a base URL, used to
 * request runtime access to a custom OpenAI-compatible endpoint. Returns null
 * for unparseable URLs. Pure.
 *
 * @example originPattern('https://api.openai.com/v1') -> 'https://api.openai.com/*'
 */
export function originPattern(baseUrl: string): string | null {
  try {
    return `${new URL(baseUrl).origin}/*`;
  } catch {
    return null;
  }
}
