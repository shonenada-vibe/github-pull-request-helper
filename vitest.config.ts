import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

export default defineConfig({
  plugins: [svelte({ hot: false }), svelteTesting()],
  test: {
    globals: true,
    // Default to the fast node environment; UI tests opt into jsdom via a
    // `// @vitest-environment jsdom` comment at the top of the file.
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'components/**/*.test.ts',
      'tests/unit/**/*.test.ts',
    ],
  },
});
