import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// https://wxt.dev/api/config.html
export default defineConfig({
  outDir: 'build',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'github-differ',
    description:
      'Group a GitHub PR diff into reviewable units with a suggested reading order.',
    permissions: ['storage'],
    host_permissions: [
      'https://api.github.com/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://carevie.dolpc.com/*',
      // Local agent bridge (bridge/server.ts).
      'http://127.0.0.1/*',
      'http://localhost/*',
    ],
    // Custom OpenAI-compatible/Carevie base URLs (OpenRouter, Together, local
    // servers) are granted at runtime from the Options page on save.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
});
