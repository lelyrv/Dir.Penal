// Comparação visual: captura de tela de páginas-chave (desktop e celular) contra imagens de referência.
// As referências ficam em tests/baseline/<sistema>/ (renderização de fontes difere entre Windows, Linux e macOS):
//   - se não existe referência para o seu sistema, ela é CRIADA e o teste passa avisando (primeira execução);
//   - se existe, a diferença máxima aceita é 1,5% dos pixels (tolerância de 24 por canal);
//   - para aceitar uma mudança visual proposital:  UPDATE_BASELINE=1 node tests/visual.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, suite, sleep, ROOT } from './lib.mjs';

const UPDATE = !!process.env.UPDATE_BASELINE;
const DIR = path.join(ROOT, 'tests', 'baseline', process.platform);
const OUT = path.join(os.tmpdir(), 'vm-visual-diff');
const MAX = 0.015;
const SHOTS = [
  ['home', 'index.html', 1280, 1500], ['home-celular', 'index.html', 390, 1500],
  ['indice-jecrim', 'index-jecrim.html?art=L9099-ART-65.html', 1280, 900],
  ['art65', 'L9099-ART-65.html', 1280, 700], ['art65-celular', 'L9099-ART-65.html', 390, 700],
  ['dp28', 'DP-ART-28.html', 1280, 700], ['treino', 'treino.html', 1280, 700], ['calculadoras', 'calculadoras.html', 1280, 900],
  ['roteiro', 'L9099-ROTEIRO.html', 1280, 700], ['sumulas', 'sumulas.html', 1280, 900],
];

const COMPARE = `async (a, b) => {
  const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + s; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return { size: false, a: [ia.width, ia.height], b: [ib.width, ib.height] };
  const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
  let diff = 0;
  for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > 24 || Math.abs(da[i + 1] - db[i + 1]) > 24 || Math.abs(da[i + 2] - db[i + 2]) > 24) diff++;
  return { size: true, ratio: diff / (c.width * c.height) };
}`;

await run(async ({ base, browser }) => {
  const T = suite('Visual (captura de tela)');
  const A = await browser.newPage();
  fs.mkdirSync(DIR, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  await A.freezeDate('2026-11-14T12:00:00-03:00');
  await A.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await A.go(base + 'index.html'); await A.ev('localStorage.clear()');
  const created = [], bad = [];
  for (const [name, file, w, wait] of SHOTS) {
    await A.viewport(w, 800, w < 500);
    await A.go(base + file, { wait });
    await A.ev('document.fonts.ready.then(() => 1)');
    await A.ev(`document.activeElement&&document.activeElement.blur&&document.activeElement.blur();window.scrollTo(0,0);1`);
    await sleep(200);
    const shot = (await A.send('Page.captureScreenshot', { format: 'png' })).result.data;
    const ref = path.join(DIR, name + '.png');
    if (UPDATE || !fs.existsSync(ref)) { fs.writeFileSync(ref, Buffer.from(shot, 'base64')); created.push(name); continue; }
    const r = await A.ev(`(${COMPARE})(${JSON.stringify(fs.readFileSync(ref).toString('base64'))}, ${JSON.stringify(shot)})`);
    if (!r.size) { bad.push(`${name}: tamanho diferente ${JSON.stringify(r)}`); }
    else if (r.ratio > MAX) { fs.writeFileSync(path.join(OUT, name + '.novo.png'), Buffer.from(shot, 'base64')); bad.push(`${name}: ${(r.ratio * 100).toFixed(2)}% dos pixels diferem (limite ${MAX * 100}%); captura nova em ${path.join(OUT, name + '.novo.png')}`); }
  }
  if (created.length) console.log(`   referências criadas/atualizadas para ${process.platform}: ${created.join(', ')}`);
  T.check(`Telas conferidas contra as referências (${SHOTS.length - created.length} comparadas, ${created.length} criadas)`, bad.length === 0, bad.join(' | '));
  T.done();
});
