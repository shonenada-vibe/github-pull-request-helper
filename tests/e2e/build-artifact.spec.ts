import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Lightweight e2e: assert the production build wires the extension correctly.
// (A full in-browser smoke test against a loaded unpacked extension is documented
// in tests/e2e/README.md — it requires `bunx playwright install` and a display.)
const here = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(here, '../../.output/chrome-mv3');

test('built manifest targets GitHub and grants API host permissions', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(OUTPUT, 'manifest.json'), 'utf8'),
  );

  const contentScript = manifest.content_scripts?.[0];
  expect(contentScript?.matches).toContain('https://github.com/*');

  expect(manifest.host_permissions).toEqual(
    expect.arrayContaining([
      'https://api.github.com/*',
      'https://api.anthropic.com/*',
    ]),
  );
  expect(manifest.permissions).toContain('storage');
});

test('content script and background bundles are emitted', async () => {
  const manifest = JSON.parse(
    await readFile(resolve(OUTPUT, 'manifest.json'), 'utf8'),
  );
  const js = manifest.content_scripts?.[0]?.js ?? [];
  expect(js.length).toBeGreaterThan(0);
  // The referenced bundle exists on disk.
  await expect(readFile(resolve(OUTPUT, js[0]), 'utf8')).resolves.toContain(
    'ANALYZE',
  );
});
