// Layout: botão "← Início" dentro do quadro, menu de atalhos (não corta, não some, âncoras visíveis), esmaecido no celular,
// CSS da barra compartilhado (sem cópias nas páginas).
import fs from 'node:fs';
import { run, suite, sleep, articleFiles, ROOT } from './lib.mjs';

await run(async ({ base, browser }) => {
  const T = suite('Layout');
  const url = (f) => base + f;
  const A = await browser.newPage();
  const files = articleFiles();

  // ── "← Início" ──
  await A.go(url('index-jecrim.html'), { wait: 800 });
  await A.ev(`document.getElementById('painel_artigos').contentDocument.querySelector('.vm-back').click(),true`); await sleep(1800);
  const top = JSON.parse(await A.ev(`JSON.stringify({path:location.pathname,iframes:document.querySelectorAll('iframe#painel_artigos').length,sidebar:!!document.getElementById('sidebar')})`));
  T.check('"← Início" dentro do quadro abre a home na janela inteira (não aninhada)', top.path.endsWith('/index.html') && top.iframes === 0 && !top.sidebar, JSON.stringify(top));
  await A.go(url('L9099-ART-65.html'), { wait: 600 });
  await A.ev(`document.querySelector('.vm-back').click(),true`); await sleep(1200);
  T.check('"← Início" em página aberta direto continua indo para a home', (await A.ev('location.pathname')).endsWith('/index.html'));

  // ── CSS compartilhado ──
  const copies = files.filter((f) => { const s = fs.readFileSync(ROOT + '/' + f, 'utf8'); return !s.includes('href="study-bar.css') || s.includes('id="vm-bar-css"') || s.includes('vm-no-gap-fixed-menus-final'); });
  T.check(`CSS único: ${files.length} páginas usam study-bar.css e nenhuma mantém cópia do bloco`, copies.length === 0, copies.join(','));

  // ── menu de atalhos a 1280 px ──
  await A.viewport(1280, 800, false);
  const m3 = async (f) => {
    await A.go(url(f), { wait: 450 });
    return JSON.parse(await A.ev(`(()=>{const n=document.querySelector('#top-nav,.tw,.navbar');if(!n)return JSON.stringify({none:true,cut:0,hidden:0,wrap:false,isTop:false,pos:'sticky',fadeR:false,h:0});
      const items=[...n.querySelectorAll('a,button')];const nb=n.getBoundingClientRect();
      const hidden=items.filter(a=>{const r=a.getBoundingClientRect();const cy=(r.top+r.bottom)/2;return r.right>innerWidth+1||r.left<-1||cy>nb.bottom||cy<nb.top}).length;
      return JSON.stringify({cut:n.scrollWidth-n.clientWidth,hidden,wrap:n.classList.contains('vm-nav-wrap'),isTop:n.id==='top-nav',pos:getComputedStyle(n).position,fadeR:n.classList.contains('vm-nav-more-r'),h:Math.round(nb.height)})})()`));
  };
  const r1280 = []; for (const f of files) r1280.push([f, await m3(f)]);
  const hid = r1280.filter(([f, r]) => r.isTop && (r.cut > 2 || r.hidden > 0)).map(([f, r]) => `${f}(cut ${r.cut}, ocultos ${r.hidden})`);
  T.check('1280px: nenhum atalho do #top-nav escondido (todas as páginas)', hid.length === 0, hid.join(', '));
  const wrapped = r1280.filter(([f, r]) => r.wrap).map(([f]) => f).sort();
  console.log('   quebram em linhas a 1280px:', wrapped.join(', '));
  T.check('Só quebra em linhas onde o menu realmente transborda', wrapped.length >= 3 && wrapped.length <= 8, wrapped.join(','));
  T.check('Menus seguem "sticky"', r1280.every(([f, r]) => r.none || r.pos === 'sticky'));
  const anch = async (f) => {
    await A.go(url(f), { wait: 600 });
    await A.ev(`document.documentElement.style.scrollBehavior='auto';1`);
    const links = JSON.parse(await A.ev(`JSON.stringify([...document.querySelectorAll('#top-nav a[href^="#"]')].map(a=>a.getAttribute('href')))`));
    const bad = [];
    for (const h of links.slice(-4)) {
      await A.ev(`document.querySelector('#top-nav a[href="${h}"]').click(),true`); await sleep(350);
      const r = JSON.parse(await A.ev(`(()=>{const t=document.querySelector('${h}');const n=document.getElementById('top-nav').getBoundingClientRect();return JSON.stringify({top:Math.round(t.getBoundingClientRect().top),nb:Math.round(n.bottom)})})()`));
      if (r.top < r.nb - 1) bad.push(`${h}: topo ${r.top} < menu ${r.nb}`);
    }
    return bad;
  };
  for (const f of wrapped.slice(0, 3)) { const b = await anch(f); T.check(`${f}: âncoras não ficam sob o menu quebrado em linhas`, b.length === 0, b.join('; ')); }

  // ── menu fixo ao rolar ──
  const stick = [];
  for (const f of files.filter((x, i) => i % 4 === 0)) {
    await A.go(url(f), { wait: 450 });
    const r = JSON.parse(await A.ev(`(()=>{const n=document.querySelector('#top-nav,.tw,.navbar');if(!n)return JSON.stringify({none:true});document.documentElement.style.scrollBehavior='auto';document.documentElement.scrollTop=1500;return JSON.stringify({top:Math.round(n.getBoundingClientRect().top)})})()`));
    if (!r.none && r.top !== 46) stick.push(`${f}:${r.top}`);
  }
  T.check('Menu fica fixo sob a barra (46px) depois de rolar (amostra de 1 a cada 4 páginas)', stick.length === 0, stick.join(', '));

  // ── dentro do quadro do índice ──
  await A.go(url('index-jecrim.html'), { wait: 1200 });
  await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;d.documentElement.style.scrollBehavior='auto';d.documentElement.scrollTop=2500;return 1})()`); await sleep(300);
  const fr = JSON.parse(await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;const b=d.getElementById('vm-study-bar').getBoundingClientRect();const n=d.getElementById('top-nav').getBoundingClientRect();return JSON.stringify({barTop:Math.round(b.top),navTop:Math.round(n.top)})})()`));
  T.check('No quadro: barra e menu ficam visíveis depois de rolar', fr.barTop === 0 && fr.navTop === 46, JSON.stringify(fr));

  // ── celular ──
  await A.viewport(390, 800, true);
  const mob = []; for (const f of ['L9099-ART-65.html', 'DP-ART-3.html', 'DP-ART-7.html', 'CC-ART-3.html']) mob.push([f, await m3(f)]);
  T.check('390px: menus que rolam de lado mostram esmaecido à direita', mob.every(([f, r]) => r.none || r.cut <= 2 || r.fadeR), mob.map(([f, r]) => `${f}:cut=${r.cut},fade=${r.fadeR}`).join(' '));
  await A.go(url('L9099-ART-65.html'), { wait: 600 });
  await A.ev(`(()=>{const n=document.getElementById('top-nav');n.scrollLeft=n.scrollWidth;n.dispatchEvent(new Event('scroll'));return 1})()`); await sleep(300);
  T.check('390px: no fim da rolagem só resta o esmaecido à esquerda', await A.ev(`(()=>{const n=document.getElementById('top-nav');return !n.classList.contains('vm-nav-more-r')&&n.classList.contains('vm-nav-more-l')})()`) === true);
  const ovf = [];
  for (const f of files.filter((x, i) => i % 3 === 0)) { await A.go(url(f), { wait: 350 }); const o = await A.ev(`document.documentElement.scrollWidth-innerWidth`); if (o > 2) ovf.push(`${f}(+${o})`); }
  T.check('390px: nenhuma página com rolagem horizontal da página inteira (amostra)', ovf.length === 0, ovf.join(', '));
  T.check('Sem erro de JavaScript', A.errors.length === 0, A.errors.join('|'));
  T.done();
});
