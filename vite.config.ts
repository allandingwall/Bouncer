import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname, 'src'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  plugins: [
    webExtension({
      manifest: resolve(__dirname, 'src/manifest.json'),
      browser: 'firefox',
      additionalInputs: ['blocked/blocked.html'],
      disableAutoLaunch: true,
    }),
  ],
});
