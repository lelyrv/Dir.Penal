// Acessibilidade: teclado (link "Pular", foco visível, Enter), ARIA, menos movimento, índices, home, arquivos reparados.
import fs from 'node:fs';
import { run, suite, sleep, articleFiles, ROOT } from './lib.mjs';

await run(async ({ base, browser }) => {
  const T = suite('Acessibilidade');
  const url = (f) => base + f;
  const A = await browser.newPage();
  const active = () => A.ev(`(()=>{const a=document.activeElement;return JSON.stringify({tag:a.tagName,cls:a.className,id:a.id,outline:getComputedStyle(a).outlineStyle+' '+getComputedStyle(a).outlineColor+' '+getComputedStyle(a).outlineWidth,top:Math.round(a.getBoundingClientRect().top)})})()`).then(JSON.parse);
  const realErrors = () => A.errors;

  // ── artigo: link "Pular", teclado, foco ──
  await A.go(url('DP-ART-28.html')); await A.ev('localStorage.clear()'); await A.go(url('DP-ART-28.html'));
  const sk = JSON.parse(await A.ev(`(()=>{const s=document.querySelector('.vm-skip');const r=s&&s.getBoundingClientRect();return JSON.stringify({exists:!!s,first:document.body.firstElementChild===s,top:s?Math.round(r.top):null,targetOk:!!(s&&document.querySelector(s.getAttribute('href')))})})()`));
  T.check('Link "Pular para o conteúdo": existe, é o 1º filho do body e aponta para alvo válido', sk.exists && sk.first && sk.targetOk, JSON.stringify(sk));
  T.check('O link fica fora da tela até receber foco', sk.top < 0, 'top=' + sk.top);
  await A.tab(); let a = await active(); await sleep(300);
  T.check('1º Tab foca o link e ele aparece na tela', a.cls.includes('vm-skip') && a.top >= 0 && a.top < 40, JSON.stringify(a));
  T.check('O link fica VISÍVEL (não coberto pela barra do cronômetro)', await A.ev(`(()=>{const s=document.querySelector('.vm-skip');const r=s.getBoundingClientRect();return [[r.left+12,r.top+12],[r.left+r.width/2,r.top+r.height/2],[r.right-12,r.bottom-12]].every(([x,y])=>document.elementFromPoint(x,y)===s)})()`) === true);
  await A.key('Enter', 'Enter', 13); await sleep(500);
  T.check('Enter no "Pular" move o foco para o conteúdo', await A.ev(`document.activeElement.hasAttribute('data-vm-main')`) === true);
  await A.go(url('DP-ART-28.html'));
  let found = null;
  for (let i = 0; i < 8 && !found; i++) { await A.tab(); a = await active(); if (a.id === 'vm-btn-start') found = a; }
  T.check('Botão Iniciar recebe foco pelo teclado com anel dourado visível', !!found && /solid/.test(found.outline) && /232, 184, 75/.test(found.outline), found ? found.outline : 'não alcançou');
  await A.key('Enter', 'Enter', 13); await sleep(1300);
  T.check('Enter no botão Iniciar inicia o cronômetro', (await A.ev(`document.getElementById('vm-status').textContent`)) === 'Estudando');
  const aria = JSON.parse(await A.ev(`JSON.stringify({bar:document.getElementById('vm-study-bar').getAttribute('role')+'/'+document.getElementById('vm-study-bar').getAttribute('aria-label'),timer:document.getElementById('vm-timer').getAttribute('role'),status:document.getElementById('vm-status').getAttribute('role')+'/'+document.getElementById('vm-status').getAttribute('aria-live'),pause:document.getElementById('vm-btn-pause').getAttribute('aria-label'),end:document.getElementById('vm-btn-end').getAttribute('aria-label'),nav:document.getElementById('top-nav').getAttribute('aria-label')})`));
  T.check('ARIA: região, timer, status (polite), botões e menu com nome acessível', aria.bar === 'region/Cronômetro de estudo' && aria.timer === 'timer' && aria.status === 'status/polite' && !!aria.pause && !!aria.end && !!aria.nav, JSON.stringify(aria));
  await A.ev(`document.getElementById('vm-btn-pause').click(),true`); await sleep(200);
  T.check('ARIA: rótulo do botão acompanha o estado (Retomar estudo)', (await A.ev(`document.getElementById('vm-btn-start').getAttribute('aria-label')`)) === 'Retomar estudo');
  await A.ev(`document.getElementById('vm-btn-end').click(),true`);
  await A.go(url('DP-ART-3.html'));
  T.check('Menu em abas (.tw) ganha role=navigation e nome', await A.ev(`(()=>{const n=document.querySelector('.tw');return n.getAttribute('role')==='navigation'&&!!n.getAttribute('aria-label')})()`));

  // ── menos movimento ──
  await A.go(url('DP-ART-28.html'));
  T.check('Sem preferência, a rolagem suave original continua', (await A.ev(`getComputedStyle(document.documentElement).scrollBehavior`)) === 'smooth');
  await A.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const rm = {};
  for (const p of ['DP-ART-28.html', 'L9099-ART-65.html', 'index-penal.html', 'index.html']) { await A.go(url(p), { wait: 500 }); rm[p] = await A.ev(`getComputedStyle(document.documentElement).scrollBehavior`); }
  T.check('"Reduzir movimento": rolagem instantânea no artigo, no índice e na home', Object.values(rm).every((v) => v === 'auto'), JSON.stringify(rm));
  await A.go(url('index.html'), { wait: 600 });
  T.check('Animação dos cards da home praticamente desligada', (await A.ev(`parseFloat(getComputedStyle(document.querySelector('.materia-card')).animationDuration)`)) < 0.01);
  await A.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

  // ── índices ──
  for (const f of ['index-penal.html', 'index-civil.html', 'index-clt.html', 'index-jecrim.html']) {
    await A.go(url(f), { wait: 500 });
    const r = JSON.parse(await A.ev(`JSON.stringify({h1:document.querySelectorAll('h1').length,sr:(()=>{const r=document.querySelector('h1').getBoundingClientRect();return r.width<=1&&r.height<=1})(),exp:document.querySelector('.menu-toggle').getAttribute('aria-expanded'),lab:document.querySelector('.menu-toggle').getAttribute('aria-label'),soon:[...document.querySelectorAll('.menu-artigos a.em-breve')].every(a=>a.getAttribute('aria-disabled')==='true'&&a.getAttribute('tabindex')==='0')})`));
    await A.ev(`toggleMenu(),true`); const closed = await A.ev(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`);
    await A.ev(`toggleMenu(),true`); const again = await A.ev(`document.querySelector('.menu-toggle').getAttribute('aria-expanded')`);
    T.check(`${f}: um <h1> oculto, botão ☰ com nome e aria-expanded sincronizado, itens "em breve" acessíveis`, r.h1 === 1 && r.sr && r.exp === 'true' && closed === 'false' && again === 'true' && !!r.lab && r.soon && A.errors.length === 0 && A.netErrors.length === 0, JSON.stringify(r));
  }

  // ── home ──
  await A.setLS({ vadeMecum_completedArticles: { 'CC-ART-1': { subject: 'Cód. Civil', subjectId: 'CC', articleNum: 1 }, 'CC-ART-2': { subject: 'Cód. Civil', subjectId: 'CC', articleNum: 2 }, 'L9099-ART-65': { subject: 'Lei 9.099/95', subjectId: 'L9099', articleNum: 65 } } });
  await A.go(url('index.html'), { wait: 900 });
  const home = JSON.parse(await A.ev(`(()=>{dbRefresh();const last=[...document.querySelectorAll('#dbSummaryBody tr')].pop();return JSON.stringify({main:!!document.querySelector('main.page-wrap'),h1:document.querySelectorAll('h1').length,pct:document.getElementById('db-completed-pct').textContent,cc:document.getElementById('prog-CC-label').textContent+' '+document.getElementById('prog-CC-pct').textContent,jec:document.getElementById('prog-L9099-label').textContent+' '+document.getElementById('prog-L9099-pct').textContent,clt:document.getElementById('prog-CLT-label').textContent,total:last?last.children[1].textContent.trim()+' | '+last.children[2].textContent.trim()+' | '+last.children[3].textContent.trim():null,api:VMTracker.getTotalArticles()})})()`));
  T.check('Home: landmark <main> e um <h1>', home.main && home.h1 === 1);
  T.check('Home: total geral vem da configuração (5.308), sem número fixo no HTML', home.api === 5308 && home.pct === 'de 5.308 artigos totais' && home.total.startsWith('5.308 | 3 | 0.1%'), `${home.pct} / ${home.total}`);
  T.check('Home: barras por matéria calculadas em laço (CC 2/2046, JECrim 1/97, CLT 0/922)', home.cc === '2 / 2046 artigos 0.1%' && home.jec === '1 / 97 artigos 1.0%' && home.clt === '0 / 922 artigos', `${home.cc} | ${home.jec} | ${home.clt}`);
  T.check('Home: sem erro de JavaScript e sem 404', A.errors.length === 0 && A.netErrors.length === 0, [...A.errors, ...A.netErrors].join('|'));
  await A.ev('localStorage.clear()');

  // ── arquivos que foram reparados ──
  await A.go(url('CLT-ART-4.html'), { wait: 600 });
  const c4 = JSON.parse(await A.ev(`JSON.stringify({title:document.title,quirks:document.compatMode,h1:document.querySelector('h1').textContent})`));
  T.check('CLT-ART-4 (placeholder): título legível, modo padrão e h1', c4.title === 'Art. 4º CLT — Tempo à Disposição | Magistratura ENAM' && c4.quirks === 'CSS1Compat' && c4.h1.startsWith('Art. 4º'), JSON.stringify(c4));
  await A.go(url('CC-ART-5.html'), { wait: 600 });
  await A.ev(`document.getElementById('vm-btn-start').click(),true`); await sleep(1300);
  await A.ev(`document.getElementById('vm-btn-end').click(),true`); await sleep(200);
  const s5 = await A.sessions();
  T.check('CC-ART-5: a barra grava a sessão e o "Concluído" persiste', s5.length === 1 && s5[0].articleFile === 'CC-ART-5');
  T.check('Sem erro de JavaScript nas páginas reparadas', A.errors.length === 0, A.errors.join('|'));

  // ── semântica estática de todas as páginas ──
  const bad = [];
  for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
    const t = fs.readFileSync(ROOT + '/' + f, 'utf8');
    if (!/<html lang="pt-BR"/.test(t)) bad.push(f + ': lang');
    if (!/name="viewport"/.test(t)) bad.push(f + ': viewport');
    if ((t.match(/<h1[\s>]/g) || []).length !== 1) bad.push(f + ': h1');
  }
  T.check('Todas as páginas: lang="pt-BR", viewport e exatamente um <h1>', bad.length === 0, bad.join(', '));
  T.done();
});
