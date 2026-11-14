// Modo offline: o service worker guarda tudo; depois o SERVIDOR É DESLIGADO e o site continua funcionando
// (páginas nunca visitadas, fontes, gráfico, busca, cronômetro).
import fs from 'node:fs';
import { run, suite, sleep, ROOT } from './lib.mjs';

await run(async ({ base, server, browser }) => {
  const T = suite('Modo offline');
  const A = await browser.newPage();
  const url = (f) => base + f;
  const swText = fs.readFileSync(ROOT + '/sw.js', 'utf8');
  const version = swText.match(/const VERSION = '([0-9a-f]+)'/)[1];

  await A.go(url('index.html'), { wait: 800 });
  // espera o service worker instalar e guardar os artigos
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    ready = await A.ev(`(async()=>{const ks=await caches.keys();if(!ks.length)return false;const c=await caches.open(ks[0]);const k=await c.keys();return k.some(r=>r.url.endsWith('DP-ART-13.html'))&&k.some(r=>r.url.endsWith('search-index-CP.json'))&&k.some(r=>r.url.endsWith('treino.html'))&&k.some(r=>r.url.endsWith('data/laws/CP.json'))&&k.some(r=>r.url.includes('fonts/'))})()`);
    if (!ready) await sleep(300);
  }
  T.check('Service worker instalou e guardou artigos (inclusive os nunca visitados), fontes e índice de busca', ready === true);
  const keys = JSON.parse(await A.ev(`caches.keys().then(k=>JSON.stringify(k))`));
  T.check('O cache leva a versão do conteúdo (sw.js gerado pelo build)', keys.length === 1 && keys[0] === 'vm-' + version, `${keys} vs vm-${version}`);
  await A.go(url('index.html'), { wait: 600 });
  T.check('A página passa a ser controlada pelo service worker', await A.ev(`!!navigator.serviceWorker.controller`) === true);
  const cached = JSON.parse(await A.ev(`(async()=>{const c=await caches.open(${JSON.stringify(keys[0])});const k=await c.keys();return JSON.stringify({n:k.length,pages:k.filter(r=>/-ART-\\d+\\.html$/.test(r.url)).length,woff:k.filter(r=>r.url.endsWith('.woff2')).length,chart:k.some(r=>r.url.includes('chart.umd')),icons:k.filter(r=>r.url.includes('icons/')).length})})()`));
  const man = JSON.parse(fs.readFileSync(ROOT + '/articles.json', 'utf8'));
  const nAv = Object.values(man.articles).filter((a) => a.available && a.kind === 'artigo').length;
  T.check('O cache tem todos os artigos publicados, as fontes, o gráfico e os ícones', cached.pages === nAv && cached.woff >= 20 && cached.chart && cached.icons >= 3, JSON.stringify(cached) + ' esperado ' + nAv);

  // ===== desliga o servidor =====
  await server.close();
  await sleep(400);
  const probe = await fetch(base + 'index.html').then(() => 'respondeu').catch(() => 'sem servidor');
  T.check('Servidor realmente desligado (a prova é válida)', probe === 'sem servidor', probe);

  await A.go(url('DP-ART-13.html'), { wait: 1000 });
  const art = JSON.parse(await A.ev(`JSON.stringify({title:document.title,bar:!!document.getElementById('vm-study-bar'),h1:!!document.querySelector('h1'),err:document.body.textContent.includes('This site can')})`));
  T.check('Artigo NUNCA aberto antes carrega offline', art.bar && art.h1 && !art.err && art.title.includes('13'), JSON.stringify(art));
  const fonts = JSON.parse(await A.ev(`Promise.all([document.fonts.load('700 16px "Playfair Display"'),document.fonts.load('400 16px "Source Serif 4"')]).then(r=>JSON.stringify(r.map(x=>x.length)))`));
  T.check('Fontes carregam do cache (sem Google Fonts)', fonts.every((n) => n > 0), JSON.stringify(fonts));
  await A.ev(`document.getElementById('vm-btn-start').click(),true`); await sleep(1300);
  await A.ev(`document.getElementById('vm-btn-end').click(),true`); await sleep(200);
  T.check('Cronômetro funciona offline e grava a sessão', (await A.sessions()).length === 1);
  await A.go(url('index-penal.html'), { wait: 800 });
  T.check('Índice carrega offline e abre um artigo no quadro', await A.ev(`(()=>{document.querySelector('.menu-artigos a[href="DP-ART-9.html"]').click();return true})()`) && (await sleep(1500), (await A.ev(`document.getElementById('painel_artigos').contentDocument.title`)).includes('9')));
  await A.go(url('index.html'), { wait: 1000 });
  const home = JSON.parse(await A.ev(`JSON.stringify({chart:typeof Chart,cards:document.querySelectorAll('.materia-card').length,canvas:!!document.querySelector('canvas')})`));
  T.check('Home offline: gráfico (Chart.js local) e cards', home.chart === 'function' && home.cards >= 12 && home.canvas, JSON.stringify(home));
  await A.ctrlK(); await A.type('nulidade'); await sleep(900);
  T.check('Busca funciona offline (índice vem do cache)', (await A.ev(`document.querySelectorAll('#vs-list .vs-item').length`)) > 0);
  await A.key('Escape', 'Escape', 27);
  const nf = await A.go(url('qualquer-coisa.html'), { wait: 800 }).then(() => A.ev(`document.title`));
  T.check('Endereço inexistente offline: cai na home guardada, não numa tela de erro do navegador', /Vade Mecum/.test(nf), nf);
  T.check('Sem erro de JavaScript offline', A.errors.length === 0, A.errors.join('|'));

  // selo de conexão
  await A.go(url('index.html'), { wait: 600 });
  await A.send('Network.enable');
  await A.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(500);
  const chip = await A.ev(`(()=>{const c=document.getElementById('vm-offline-chip');return c&&c.style.display!=='none'?c.textContent:null})()`);
  T.check('Selo "Sem conexão" aparece quando o aparelho fica offline', !!chip && chip.includes('Sem conexão'), chip);
  T.done();
});
