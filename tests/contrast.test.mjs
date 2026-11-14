// Auditoria de contraste (WCAG 2.x): cor do texto contra o fundo efetivo, em todas as páginas e nos dois temas.
// Mínimos: 4,5:1 para texto normal; 3:1 para texto grande (>= 24 px, ou >= 18,66 px em negrito).
// Fundos em degradê ou imagem não são medidos (contados como "indeterminado").
// Páginas antigas têm falhas conhecidas: tests/contrast-baseline.json guarda o máximo aceito por página; o teste só
// FALHA se uma página piorar (ou se uma página nova trouxer falhas). Para aceitar o estado atual:  node tests/contrast.test.mjs --update
import fs from 'node:fs';
import path from 'node:path';
import { run, suite, articleFiles, ROOT } from './lib.mjs';

const UPDATE = process.argv.includes('--update');
const BASE = path.join(ROOT, 'tests', 'contrast-baseline.json');

const MEASURE = `(() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(s => parseFloat(s)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  function bgOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;          // degradê/imagem: não medido
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  const bad = [], seen = new Set(); let ok = 0, unk = 0;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest('script,style,noscript,[hidden],#vm-cite-pop,#vm-search,button:disabled')) continue;     // desabilitado é isento
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    let eo = 1; for (let e = el; e; e = e.parentElement) eo *= parseFloat(getComputedStyle(e).opacity);
    if (eo < 0.05) continue;
    const bg = bgOf(el);
    if (!bg) { unk++; continue; }
    let fg = parse(cs.color); if (!fg) continue;
    fg = fg.a < 1 ? over(fg, bg) : fg;
    if (eo < 1) fg = over({ r: fg.r, g: fg.g, b: fg.b, a: eo }, bg);
    const a = L(fg) + 0.05, b = L(bg) + 0.05, ratio = Math.max(a, b) / Math.min(a, b);
    const px = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = px >= 24 || (px >= 18.66 && bold);
    if (ratio < (large ? 3 : 4.5)) bad.push({ t: n.nodeValue.trim().slice(0, 30), r: Math.round(ratio * 100) / 100, c: cs.color, px: px }); else ok++;
  }
  return JSON.stringify({ ok, unk, bad: bad.length, ex: bad.slice(0, 3) });
})()`;

await run(async ({ base, browser }) => {
  const T = suite('Contraste (WCAG)');
  const A = await browser.newPage();
  const url = (f) => base + f;
  const pages = ['index.html', 'index-penal.html', 'index-jecrim.html', 'treino.html', 'sumulas.html', 'calculadoras.html', 'L9099-ROTEIRO.html', ...articleFiles()];
  const result = {};
  await A.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });   // sem animação de entrada no meio da medição
  await A.go(url('index.html')); await A.ev('localStorage.clear()');
  for (const f of pages) {
    await A.go(url(f), { wait: 450 });
    result[f] = JSON.parse(await A.ev(MEASURE));
  }
  // tema escuro (experimental) numa amostra
  await A.ev(`localStorage.setItem('vadeMecum_ui', JSON.stringify({dark:true}))`);
  for (const f of ['L9099-ART-65.html', 'DP-ART-28.html']) {
    await A.go(url(f), { wait: 500 });
    result[f + ' [escuro]'] = JSON.parse(await A.ev(MEASURE));
  }
  await A.ev(`localStorage.removeItem('vadeMecum_ui')`);

  const tot = Object.values(result).reduce((a, r) => ({ ok: a.ok + r.ok, bad: a.bad + r.bad, unk: a.unk + r.unk }), { ok: 0, bad: 0, unk: 0 });
  console.log(`   elementos medidos: ${tot.ok + tot.bad} (${tot.ok} ok, ${tot.bad} abaixo do mínimo); ${tot.unk} em fundo degradê/imagem, não medidos`);
  const worst = Object.entries(result).sort((a, b) => b[1].bad - a[1].bad).slice(0, 6).map(([f, r]) => `${f}:${r.bad}`);
  console.log('   páginas com mais falhas:', worst.join(', '));
  const cur = Object.fromEntries(Object.entries(result).map(([f, r]) => [f, r.bad]));
  if (UPDATE) {
    fs.writeFileSync(BASE, JSON.stringify(cur, null, 1) + '\n');
    console.log('   baseline de contraste gravada.');
  }
  const base0 = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {};
  const worse = Object.entries(cur).filter(([f, n]) => n > (base0[f] ?? 0));
  T.check(`Nenhuma página piorou em contraste em relação à linha de base (${Object.keys(cur).length} páginas)`, worse.length === 0,
    worse.map(([f, n]) => `${f}: ${n} (era ${base0[f] ?? 0}; ex.: ${JSON.stringify(result[f].ex[0] || '')})`).slice(0, 4).join(' | '));
  const strict = ['treino.html', 'sumulas.html', 'calculadoras.html', 'L9099-ROTEIRO.html'];
  const strictBad = strict.filter((f) => result[f].bad > 0);
  T.check('Páginas de ferramenta novas (treino, súmulas, calculadoras, roteiro): zero falhas de contraste', strictBad.length === 0,
    strictBad.map((f) => `${f}: ${result[f].bad} (${JSON.stringify(result[f].ex.slice(0, 2))})`).join(' | '));
  const l9099 = Object.keys(result).filter((f) => /^L9099-ART/.test(f) && !f.includes('['));
  T.check('Artigos da Lei 9.099: contraste medido', l9099.length === 6 && l9099.every((f) => result[f].ok > 200));
  T.done();
});
