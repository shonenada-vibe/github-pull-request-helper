import { defineConfig } from '@playwright/test';

// E2E tests run against static GitHub "Files changed" fixtures served locally,
// with the extension's content-script logic exercised against the DOM.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    headless: true,
  },
});
