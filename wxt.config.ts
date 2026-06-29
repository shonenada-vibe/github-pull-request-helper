import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// https://wxt.dev/api/config.html
export default defineConfig({
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
    ],
    // Custom OpenAI-compatible base URLs (OpenRouter, Together, local servers)
    // are granted at runtime from the Options page when the user saves them.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
});
