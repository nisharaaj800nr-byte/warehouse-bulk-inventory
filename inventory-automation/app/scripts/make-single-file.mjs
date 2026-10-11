/* Builds dist-gas/App.html — a single, fully self-contained HTML file for
   Google Apps Script HtmlService (paste as an HTML file named "App").

   Usage: node scripts/make-single-file.mjs   (run after `vite build`) */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const outDir = join(root, 'dist-gas');
const outFile = join(outDir, 'App.html');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found — run `vite build` first.');
  process.exit(1);
}

let html = readFileSync(join(dist, 'index.html'), 'utf8');

const read = (file) => {
  const p = join(dist, file.replace(/^\.\//, ''));
  if (!existsSync(p)) throw new Error('Missing build asset: ' + file);
  return readFileSync(p, 'utf8');
};

html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
  const m = tag.match(/href="([^"]+)"/);
  if (!m) return tag;
  return '<style>\n' + read(m[1]) + '\n</style>';
});
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');
html = html.replace(/<script([^>]*)\ssrc="([^"]+)"([^>]*)><\/script>/g, (_m, pre, src, post) => {
  const isModule = /type="module"/.test(pre + ' ' + post);
  /* Escape any literal "</script" inside the bundle so the inline script
     cannot be terminated early by its own content. */
  const js = read(src).replace(/<\/script/gi, '<\\/script');
  return '<script' + (isModule ? ' type="module"' : '') + '>\n' + js + '\n</script>';
});

/* Only the HTML skeleton is checked: bundled JS/CSS strings legitimately
   contain src="/href=" fragments, so strip script/style blocks first. */
const skeleton = html
  .replace(/<script[\s\S]*?<\/script>/gi, '<!--script-->')
  .replace(/<style[\s\S]*?<\/style>/gi, '<!--style-->');
const refs = skeleton.match(/(?:src|href)="(?!data:|#)[^"]*"/g) || [];
if (refs.length) {
  console.error('Single-file output still references external files:');
  refs.forEach((r) => console.error('  ' + r));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html, 'utf8');
console.log('Wrote ' + outFile + ' (' + Math.round(Buffer.byteLength(html) / 1024) + ' KB)');
