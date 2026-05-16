import { Resvg } from '@resvg/resvg-js';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Rasterise public/icon.svg to PNGs at the sizes the manifest references.
 * Run with `bun run icons`.
 */

const SIZES = [16, 32, 48, 96, 128] as const;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const svgPath = resolve(root, 'public/icon.svg');
const outDir = resolve(root, 'public/icons');

mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath, 'utf8');

for (const size of SIZES) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Iowan Old Style',
    },
  });
  const png = resvg.render().asPng();
  const out = resolve(outDir, `icon-${size}.png`);
  writeFileSync(out, png);
  process.stdout.write(`  • ${size}px → ${out.replace(root + '/', '')}\n`);
}

process.stdout.write('Done.\n');
