// Varredura de TODAS as páginas de artigo: carrega sem erro/404, usa fontes locais, tem noindex, a barra monta e
// o ciclo iniciar → pausa → fim grava no artigo certo, menu fixo, atalhos do menu levam a seções que existem.
import fs from 'node:fs';
import { run, suite, sleep, articleFiles, ROOT } from './lib.mjs';

await run(async ({ base, browser }) => {
  const T = suite('Páginas de artigo');
  const url = (f) => base + f;
  const A = await browser.newPage();
  const files = articleFiles();
  const bad = [], badNet = [], badAnchor = [], badMeta = [];
  await A.go(url('index.html')); await A.ev('localStorage.clear()');
  for (const f of files) {
    await A.go(url(f), { wait: 300 });
    const r = JSON.parse(await A.ev(`(()=>{document.documentElement.style.scrollBehavior='auto';const n=document.querySelector('#top-nav,.tw,.navbar');const bar=document.getElementById('vm-study-bar');
      document.documentElement.scrollTop=1500;const nt=n?Math.round(n.getBoundingClientRect().top):null;
      document.getElementById('vm-btn-start').click();const t1=document.getElementById('vm-status').textContent;
      document.getElementById('vm-btn-pause').click();const t2=document.getElementById('vm-status').textContent;
      document.getElementById('vm-btn-start').click();document.getElementById('vm-btn-end').click();const t3=document.getElementById('vm-status').textContent;
      const ss=JSON.parse(localStorage.getItem('vadeMecum_studySessions')||'[]');const last=ss[ss.length-1];
      const dead=[...document.querySelectorAll('#top-nav a[href^="#"]')].filter(a=>!document.querySelector(a.getAttribute('href').replace(/[^#\\w-]/g,''))).map(a=>a.getAttribute('href'));
      const robots=document.querySelector('meta[name=robots]');
      return JSON.stringify({mounted:!!bar.__vmMounted,navTop:nt,flow:[t1,t2,t3].join('>'),rec:last?last.articleFile:null,sid:bar.dataset.articleId,dead,robots:robots&&robots.content,manifest:!!document.querySelector('link[rel=manifest]'),fonts:!!document.querySelector('link[href^="fonts.css"]')})})()`));
    const src = fs.readFileSync(ROOT + '/' + f, 'utf8');
    const noNavInSource = !/id="top-nav"|class="tw"|class="navbar"/.test(src);   // páginas sem menu de atalhos (DP-ART-1, DP-ART-2, placeholder)
    if (!(r.mounted && (r.navTop === 46 || (r.navTop === null && noNavInSource)) && r.flow === 'Estudando>Pausado>Concluído ✓' && r.rec === r.sid && A.errors.length === 0)) bad.push(f + ' ' + JSON.stringify(r) + ' ' + A.errors.join('|'));
    if (A.netErrors.length) badNet.push(f + ': ' + A.netErrors.join(' / '));
    if (r.dead.length) badAnchor.push(f + ': ' + r.dead.join(','));
    if (!/noindex/.test(r.robots || '') || !r.manifest || !r.fonts) badMeta.push(f);
  }
  T.check(`${files.length} páginas: barra monta, menu fixo, ciclo iniciar→pausa→fim grava no artigo certo, sem erro de JS`, bad.length === 0, bad.join('\n   '));
  T.check('Nenhuma página gera erro de rede (404 de recurso)', badNet.length === 0, badNet.join('\n   '));
  T.check('Todos os atalhos do menu (#...) apontam para uma seção que existe', badAnchor.length === 0, badAnchor.join('\n   '));
  T.check('Todas as páginas: noindex, link do manifesto PWA e fontes locais', badMeta.length === 0, badMeta.join(', '));

  // nenhuma referência a recursos externos (o site tem de funcionar offline)
  const ext = [];
  for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
    const t = fs.readFileSync(ROOT + '/' + f, 'utf8');
    const m = [...t.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((x) => x[1]).filter((u) => /\.(js|css|woff2?)(\?|$)|fonts\.g|cdnjs|jsdelivr|unpkg/.test(u));
    if (m.length) ext.push(f + ': ' + m.slice(0, 2).join(' '));
  }
  T.check('Nenhuma página depende de script, CSS ou fonte de servidor externo (Google Fonts, cdnjs...)', ext.length === 0, ext.join('\n   '));
  T.done();
});
