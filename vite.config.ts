import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

// Railway runs a standalone Node server without a Workers/Sites dispatcher.
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: process.env.CODEX_SANDBOX === 'seatbelt'
    ? { watch: { useFsEvents: false, usePolling: true } }
    : undefined,
  plugins: [vinext()],
});
