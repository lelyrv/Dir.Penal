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
  // O tema escuro é um filtro CSS (invert + hue-rotate) sobre o conteúdo: a cor que o usuário VÊ é a cor calculada depois
  // da cadeia de filtros do elemento e de todos os ancestrais (do mais interno ao mais externo). Aqui a cadeia é aplicada.
  const clamp = (v) => Math.max(0, Math.min(255, v));
  function filterStep(c, name, arg) {
    const v = parseFloat(arg);
    if (name === 'invert') { const k = isNaN(v) ? 1 : (arg.includes('%') ? v / 100 : v); return { r: k * (255 - c.r) + (1 - k) * c.r, g: k * (255 - c.g) + (1 - k) * c.g, b: k * (255 - c.b) + (1 - k) * c.b, a: c.a }; }
    if (name === 'hue-rotate') {
      const deg = arg.includes('turn') ? v * 360 : arg.includes('rad') ? v * 180 / Math.PI : v, t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
      const m = [[0.213 + cs * 0.787 - sn * 0.213, 0.715 - cs * 0.715 - sn * 0.715, 0.072 - cs * 0.072 + sn * 0.928],
        [0.213 - cs * 0.213 + sn * 0.143, 0.715 + cs * 0.285 + sn * 0.140, 0.072 - cs * 0.072 - sn * 0.283],
        [0.213 - cs * 0.213 - sn * 0.787, 0.715 - cs * 0.715 + sn * 0.715, 0.072 + cs * 0.928 + sn * 0.072]];
      return { r: clamp(m[0][0] * c.r + m[0][1] * c.g + m[0][2] * c.b), g: clamp(m[1][0] * c.r + m[1][1] * c.g + m[1][2] * c.b), b: clamp(m[2][0] * c.r + m[2][1] * c.g + m[2][2] * c.b), a: c.a };
    }
    return c;                                                                          // outros filtros não alteram a cor aqui
  }
  function through(c, from) {
    let out = c;
    for (let e = from; e; e = e.parentElement) {
      const f = getComputedStyle(e).filter;
      if (!f || f === 'none') continue;
      for (const m of f.matchAll(/([a-z-]+)\\(([^)]*)\\)/g)) out = filterStep(out, m[1], m[2]);
    }
    return out;
  }
  function bgOf(el) {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;          // degradê/imagem: não medido
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(through(c, e)); if (c.a >= 1) break; }
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
    fg = through(fg, el);
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
  // tema escuro numa amostra (a medição aplica a cadeia de filtros: ver `through` acima)
  await A.ev(`localStorage.setItem('vadeMecum_ui', JSON.stringify({dark:true}))`);
  const DARK = ['L9099-ART-65.html', 'DP-ART-28.html', 'DP-ART-1.html', 'DP-ART-7.html', 'CLT-ART-1.html', 'CC-ART-3.html'];
  for (const f of DARK) {
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
  const darkBad = DARK.filter((f) => result[f + ' [escuro]'].bad > 0);
  T.check('Tema escuro: zero falhas de contraste nas amostras (artigos com e sem .page-wrap)', darkBad.length === 0,
    darkBad.map((f) => `${f}: ${result[f + ' [escuro]'].bad} (${JSON.stringify(result[f + ' [escuro]'].ex.slice(0, 2))})`).join(' | '));
  const strict = ['treino.html', 'sumulas.html', 'calculadoras.html', 'L9099-ROTEIRO.html'];
  const strictBad = strict.filter((f) => result[f].bad > 0);
  T.check('Páginas de ferramenta novas (treino, súmulas, calculadoras, roteiro): zero falhas de contraste', strictBad.length === 0,
    strictBad.map((f) => `${f}: ${result[f].bad} (${JSON.stringify(result[f].ex.slice(0, 2))})`).join(' | '));
  const l9099 = Object.keys(result).filter((f) => /^L9099-ART/.test(f) && !f.includes('['));
  T.check('Artigos da Lei 9.099: contraste medido', l9099.length === 11 && l9099.every((f) => result[f].ok > 200));
  T.done();
});
