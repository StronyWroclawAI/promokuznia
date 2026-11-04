// Składa sklep w jeden samodzielny plik HTML (dist/promokuznia-podglad.html):
// CSS, JS (pricing + store + app jako jeden skrypt) i katalog wklejone do środka.
// Działa bez serwera: koszyk i konto w trybie podglądu zapisują się w przeglądarce.
// Uruchom: node scripts/build-preview.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');

const [html, css, pricing, store, legal, app, catalog] = await Promise.all([
  read('public/index.html'), read('public/assets/style.css'),
  read('public/assets/pricing.js'), read('public/assets/store.js'), read('public/assets/legal.js'), read('public/assets/app.js'),
  read('public/data/catalog.json')
]);

// najprostszy „bundler”: usuwa importy i słowo export — moduły są pisane tak, by nie kolidowały nazwami
const strip = (js) => js.replace(/^import .*?;\s*$/gm, '').replace(/^export (?=(const|function|async function) )/gm, '');
const js = [pricing, store, legal, app].map(strip).join('\n');

// kody rabatowe tylko do podglądu — w prawdziwym sklepie sprawdza je serwer
const demoCoupons = [
  { code: 'START10', kind: 'procent', value: 10, min_total_gr: 5000 },
  { code: 'DOSTAWA0', kind: 'darmowa_dostawa', value: 0, min_total_gr: 10000 }
];

const body = html.slice(html.indexOf('<!--APP-->') + 10, html.indexOf('<!--/APP-->'));
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];

const out = `<title>PromoKuźnia</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
</style>
${body}
<script>window.__CATALOG__ = ${catalog.replace(/</g, '\\u003c')};
window.__DEMO_COUPONS__ = ${JSON.stringify(demoCoupons)};</script>
<script type="module">
${js}
</script>
`;

await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/promokuznia-podglad.html', root), out);
console.log(`dist/promokuznia-podglad.html — ${(out.length / 1024).toFixed(0)} KB`);
