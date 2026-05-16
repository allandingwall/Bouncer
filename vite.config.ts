import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => ({
  root: resolve(__dirname, 'src'),
  publicDir: resolve(__dirname, 'public'),
  // Relative paths so the extension works from any moz-extension:// origin.
  base: '',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    // Sourcemaps only for `vite` (dev / preview); production builds shipped
    // to AMO shouldn't ship `.map` files. `web-ext-config.cjs` also strips
    // `.map` when packaging — this avoids producing them in the first place.
    sourcemap: command !== 'build',
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
}));
