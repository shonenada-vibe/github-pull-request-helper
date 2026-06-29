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
    ],
  },
});
