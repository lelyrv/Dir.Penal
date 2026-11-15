// Funcionalidades: manifesto, busca (Ctrl+K), anterior/próximo, continuar leitura, selo de conferência,
// copiar com fonte, modo audiência, impressão por seção, backup/restauração, meta, notas, título da aba, aviso de sessão.
import fs from 'node:fs';
import { run, suite, sleep, ROOT } from './lib.mjs';

await run(async ({ base, server, browser }) => {
  const s = suite('Funcionalidades');
  const A = await browser.newPage();
  const url = (f) => base + f;
  const FROZEN = '2026-11-14T12:00:00-03:00';
  const frozenId = await A.freezeDate(FROZEN);
  await A.go(url('index.html'));
  await A.ev('localStorage.clear()');

  // ===== sem 404 e manifesto =====
  for (const f of ['index.html', 'index-penal.html', 'index-civil.html', 'index-clt.html', 'index-jecrim.html']) {
    await A.go(url(f), { wait: 800 });
    s.check(`Sem 404 nem erro de JS ao abrir ${f}`, A.errors.length === 0 && A.netErrors.length === 0, [...A.errors, ...A.netErrors].join(' | '));
  }
  const noHead = !server.hits.some((h) => h.startsWith('HEAD '));
  s.check('Nenhuma consulta HEAD ao servidor (itens "em breve" agora são estáticos)', noHead, server.hits.filter((h) => h.startsWith('HEAD')).slice(0, 3).join(','));
  const man = JSON.parse(fs.readFileSync(ROOT + '/articles.json', 'utf8'));
  const nAv = Object.values(man.articles).filter((a) => a.available).length;
  await A.go(url('index.html'), { wait: 500 });
  const m = await A.ev(`VMData.manifest().then(m=>JSON.stringify({n:Object.keys(m.articles).length,av:Object.values(m.articles).filter(a=>a.available).length,c:m.articles['L9099-ART-65.html'].checked,p:m.articles['L9099-ART-65.html'].checkedPrecision}))`);
  const mm = JSON.parse(m);
  s.check('Manifesto carrega no navegador (201 itens no catálogo; disponíveis conferem com o disco; data do art. 65)', mm.n === 201 && mm.av === nAv && mm.c === '2026-11-12' && mm.p === 'dia', m);

  // ===== menus estáticos coerentes com o manifesto =====
  for (const f of ['index-penal.html', 'index-civil.html', 'index-clt.html', 'index-jecrim.html']) {
    await A.go(url(f), { wait: 400 });
    const r = JSON.parse(await A.ev(`(async()=>{const m=await VMData.manifest();const bad=[];[...document.querySelectorAll('.menu-artigos a')].forEach(a=>{const f=a.getAttribute('href')||a.dataset.href;const av=m.articles[f]&&m.articles[f].available;const soon=a.classList.contains('em-breve');if(av===soon||(av&&!a.hasAttribute('href'))||(soon&&a.hasAttribute('href')))bad.push(f)});return JSON.stringify({n:document.querySelectorAll('.menu-artigos a').length,bad})})()`));
    s.check(`Menu de ${f}: link só onde a página existe; "em breve" no resto`, r.bad.length === 0, `itens=${r.n} incoerentes=${r.bad.join(',')}`);
  }

  // ===== busca =====
  await A.go(url('index.html'), { wait: 600 });
  await A.ctrlK();
  s.check('Busca: Ctrl+K abre a janela e foca o campo', await A.ev(`document.getElementById('vm-search').classList.contains('open')&&document.activeElement.id==='vs-q'`) === true);
  await A.type('súmula 523');
  await sleep(500);
  const r1 = JSON.parse(await A.ev(`JSON.stringify([...document.querySelectorAll('#vs-list .vs-item')].slice(0,6).map(a=>({h:a.getAttribute('href'),t:a.querySelector('.vs-t').textContent,m:a.querySelectorAll('mark').length})))`));
  s.check('Busca "súmula 523": há resultados com termo destacado, e o art. 65 (JECrim) está entre os primeiros', r1.length > 0 && r1.some((x) => x.h.startsWith('L9099-ART-65.html')) && r1[0].m > 0, JSON.stringify(r1.slice(0, 3)));
  const rNo = JSON.parse(await A.ev(`(()=>{const q=document.getElementById('vs-q');q.value='SUMULA 523';q.dispatchEvent(new Event('input'));return JSON.stringify([...document.querySelectorAll('#vs-list .vs-item')].length)})()`));
  s.check('Busca ignora acento e caixa ("SUMULA 523" acha o mesmo)', rNo > 0);
  await A.ev(`(()=>{const q=document.getElementById('vs-q');q.value='art 65';q.dispatchEvent(new Event('input'))})()`); await sleep(300);
  s.check('Busca "art 65": o primeiro resultado é do art. 65', (await A.ev(`document.querySelector('#vs-list .vs-item').getAttribute('href')`)).startsWith('L9099-ART-65'));
  await A.ev(`(()=>{const q=document.getElementById('vs-q');q.value='qwxzyk';q.dispatchEvent(new Event('input'))})()`); await sleep(300);
  s.check('Busca sem resultado mostra mensagem', (await A.ev(`document.getElementById('vs-list').textContent`)).includes('Nenhum resultado'));
  await A.ev(`(()=>{const s=document.getElementById('vs-subj');s.value='CP';s.dispatchEvent(new Event('change'));const q=document.getElementById('vs-q');q.value='nulidade';q.dispatchEvent(new Event('input'))})()`); await sleep(300);
  s.check('Filtro de matéria: só resultados do Código Penal (DP-)', await A.ev(`[...document.querySelectorAll('#vs-list .vs-item')].every(a=>a.getAttribute('href').startsWith('DP-'))`) === true);
  await A.ev(`(()=>{const s=document.getElementById('vs-subj');s.value='';s.dispatchEvent(new Event('change'));const q=document.getElementById('vs-q');q.value='transação penal';q.dispatchEvent(new Event('input'))})()`); await sleep(300);
  const sel0 = await A.ev(`document.querySelector('#vs-list .vs-item.sel').id`);
  await A.key('ArrowDown', 'ArrowDown', 40);
  const sel1 = await A.ev(`document.querySelector('#vs-list .vs-item.sel').id`);
  s.check('Busca: seta ↓ move a seleção (aria-activedescendant acompanha)', sel0 === 'vs-o0' && sel1 === 'vs-o1' && (await A.ev(`document.getElementById('vs-q').getAttribute('aria-activedescendant')`)) === 'vs-o1');
  await A.key('ArrowUp', 'ArrowUp', 38);
  const target = await A.ev(`document.querySelector('#vs-list .vs-item.sel').getAttribute('href')`);
  await A.key('Enter', 'Enter', 13); await sleep(1500);
  const loc = await A.ev(`location.pathname+location.search`);
  s.check('Busca na home: Enter abre o resultado no visualizador da matéria (menu + quadro)', /index-[a-z]+\.html\?art=/.test(loc), loc);
  const framePath = await A.ev(`document.getElementById('painel_artigos').contentWindow.location.pathname`);
  s.check('...e o quadro carrega o artigo escolhido', framePath.endsWith('/' + target.split('#')[0]), `${framePath} vs ${target}`);
  // dentro do índice: abre no quadro, sem sair da página
  await A.go(url('index-jecrim.html'), { wait: 500 });
  await A.ctrlK(); await A.type('defesa técnica'); await sleep(500);
  await A.key('Enter', 'Enter', 13); await sleep(1500);
  s.check('Busca no índice: abre o resultado no quadro (a página de fora não muda)', (await A.ev(`location.pathname`)).endsWith('index-jecrim.html') && (await A.ev(`document.getElementById('painel_artigos').contentWindow.location.pathname`)).includes('-ART-'));
  // o termo buscado fica destacado e o resultado abre já no trecho
  await sleep(900);
  const fd = JSON.parse(await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;const w=d.defaultView;const m=[...d.querySelectorAll('mark.vm-find')];const first=d.querySelector('mark[data-vm-find-first]');const r=first&&first.getBoundingClientRect();return JSON.stringify({n:m.length,txt:[...new Set(m.map(x=>x.textContent.toLowerCase()))].slice(0,4),inView:!!r&&r.top>=0&&r.bottom<=w.innerHeight,y:w.pageYOffset})})()`));
  s.check('Busca: ao abrir o resultado, o termo ("defesa técnica") fica destacado e a primeira ocorrência está visível na tela', fd.n > 0 && fd.txt.some((t) => t.includes('defesa') || t.includes('técnica')) && fd.inView, JSON.stringify(fd));
  await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;d.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))})()`); await sleep(150);
  s.check('Busca: Esc remove o destaque e devolve o texto intacto', (await A.ev(`document.getElementById('painel_artigos').contentDocument.querySelectorAll('mark.vm-find').length`)) === 0);
  s.check('Busca: a janela fecha sozinha ao abrir um resultado', await A.ev(`!document.getElementById('vm-search').classList.contains('open')`) === true);
  await A.ctrlK(); const abriu = await A.ev(`document.getElementById('vm-search').classList.contains('open')`);
  await A.ctrlK();
  s.check('Busca: Ctrl+K abre e Ctrl+K de novo fecha', abriu === true && (await A.ev(`!document.getElementById('vm-search').classList.contains('open')`)) === true);
  await A.ev(`document.querySelector('.vm-search-btn').click(),true`); await sleep(200);
  await A.key('Escape', 'Escape', 27);
  s.check('Busca: botão da barra lateral abre; Esc fecha', await A.ev(`!document.getElementById('vm-search').classList.contains('open')`) === true);

  // ===== anterior / próximo =====
  const pn = async (f) => { await A.go(url(f), { wait: 700 }); return JSON.parse(await A.ev(`JSON.stringify({prev:(document.querySelector('.vm-pn-prev')||{}).getAttribute&&document.querySelector('.vm-pn-prev').getAttribute('href'),next:(document.querySelector('.vm-pn-next')||{}).getAttribute&&document.querySelector('.vm-pn-next').getAttribute('href'),before:document.querySelector('.vm-pn')?document.querySelector('.vm-pn').nextElementSibling&&document.querySelector('.vm-pn').nextElementSibling.tagName:null})`)); };
  let r = await pn('L9099-ART-62.html');
  s.check('Anterior/próximo no art. 62: ← art. 61, art. 63 →', r.prev === 'L9099-ART-61.html' && r.next === 'L9099-ART-63.html', JSON.stringify(r));
  r = await pn('L9099-ART-60.html');
  s.check('Art. 60 (primeiro): só "próximo"', !r.prev && r.next === 'L9099-ART-61.html', JSON.stringify(r));
  r = await pn('L9099-ART-65.html');
  s.check('Art. 65: ← art. 64, art. 66 →', r.prev === 'L9099-ART-64.html' && r.next === 'L9099-ART-66.html', JSON.stringify(r));
  r = await pn('L9099-ART-70.html');
  s.check('Art. 70 (último publicado): só "anterior"', r.prev === 'L9099-ART-69.html' && !r.next, JSON.stringify(r));
  r = await pn('DP-ART-28.html');
  s.check('DP-ART-28: anterior é o 27; sem "próximo" porque o 29 ainda não foi publicado', r.prev === 'DP-ART-27.html' && !r.next, JSON.stringify(r));
  await A.go(url('index-jecrim.html?art=L9099-ART-62.html'), { wait: 1200 });
  await A.ev(`document.getElementById('painel_artigos').contentDocument.querySelector('.vm-pn-next').click(),true`); await sleep(1500);
  const act = await A.ev(`(()=>{const a=document.querySelector('.menu-artigos a.active');return a&&a.getAttribute('href')})()`);
  s.check('No quadro: "próximo" abre o art. 63 e o menu lateral marca o item ativo', (await A.ev(`document.getElementById('painel_artigos').contentWindow.location.pathname`)).endsWith('L9099-ART-63.html') && act === 'L9099-ART-63.html', act);

  // ===== selo de conferência (relógio congelado em 14/11/2026) =====
  const fr = async (f) => { await A.go(url(f), { wait: 700 }); for (let i = 0; i < 25 && !(await A.ev(`!!document.querySelector('.vm-fresh')`)); i++) await sleep(200); return JSON.parse(await A.ev(`(()=>{const e=document.querySelector('.vm-fresh');return JSON.stringify(e?{cls:e.className,txt:e.textContent}:null)})()`)); };
  r = await fr('L9099-ART-65.html');
  s.check('Selo: art. 65 conferido em 12/11/2026 → "ok", sem alerta', r && r.cls.includes('vm-fresh-ok') && r.txt.includes('12/11/2026') && r.txt.includes('há 2 dias') && !r.txt.includes('Antes de usar'), JSON.stringify(r));
  r = await fr('DP-ART-28.html');
  s.check('Selo: DP-ART-28 (29/04/2026) passou do prazo → alerta de revisão', r && /vm-fresh-(old|warn)/.test(r.cls) && r.txt.includes('29/04/2026') && r.txt.includes('Antes de usar'), JSON.stringify(r));
  r = await fr('CLT-ART-2.html');
  s.check('Selo: página só com ano → "sem data exata" + alerta', r && r.txt.includes('2025') && r.txt.includes('sem data exata') && r.txt.includes('Antes de usar'), JSON.stringify(r));
  r = await fr('DP-ART-1.html');
  s.check('Selo: página sem nenhuma data → avisa que não há data registrada', r && r.cls.includes('unknown') && r.txt.includes('Sem data'), JSON.stringify(r));

  // ===== copiar com a fonte =====
  await A.go(url('L9099-ART-65.html'), { wait: 900 });
  await A.ev(`window.__copied=null;Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{window.__copied=t;return Promise.resolve()}},configurable:true});1`);
  const nCopy = await A.ev(`document.querySelectorAll('.vm-copy').length`);
  await A.ev(`document.querySelector('.prova-item .vm-copy').click(),true`); await sleep(300);
  const copied = await A.ev(`window.__copied`);
  s.check('Copiar: botão em citações, quadros e pontos recorrentes', nCopy > 40, 'botões=' + nCopy);
  s.check('Copiar um ponto recorrente: "P:/R:" + fonte (lei, artigo e endereço)', /^P: .+\nR: .+\n— Fonte: Lei 9\.099\/95, art\. 65 .+#recorrentes/s.test(copied || ''), copied);
  await A.ev(`document.querySelector('.law-quote .vm-copy').click(),true`); await sleep(300);
  s.check('Copiar uma citação inclui a fonte e não inclui o texto do botão', (await A.ev(`window.__copied`)).includes('— Fonte:') && !(await A.ev(`window.__copied`)).includes('Copiar'));

  // ===== modo audiência =====
  await A.ev(`localStorage.removeItem('vadeMecum_hearing')`);
  await A.go(url('L9099-ART-65.html'), { wait: 800 });
  await A.ev(`document.querySelector('.vm-dock [data-a=hearing]').click(),true`); await sleep(400);
  const hv = JSON.parse(await A.ev(`JSON.stringify({on:document.documentElement.classList.contains('vm-hearing'),prova:getComputedStyle(document.getElementById('recorrentes')).display,hero:getComputedStyle(document.getElementById('hero')).display,sec:getComputedStyle(document.getElementById('texto-legal')).display,nav:getComputedStyle(document.getElementById('top-nav')).display,bar:getComputedStyle(document.getElementById('vm-study-bar')).display,title:document.querySelector('.vm-hearing-title').textContent,pressed:document.querySelector('.vm-dock [data-a=hearing]').getAttribute('aria-pressed'),provaTop:Math.round(document.getElementById('recorrentes').getBoundingClientRect().top)})`));
  s.check('Modo audiência: só "pontos recorrentes" visíveis; barra de estudo continua', hv.on && hv.prova !== 'none' && hv.hero === 'none' && hv.sec === 'none' && hv.nav === 'none' && hv.bar !== 'none' && hv.pressed === 'true' && hv.title.includes('art. 65'), JSON.stringify(hv));
  s.check('Modo audiência: conteúdo não fica escondido sob a barra do cronômetro', hv.provaTop >= 46, 'topo=' + hv.provaTop);
  await A.go(url('L9099-ART-65.html'), { wait: 800 });
  s.check('Modo audiência: lembrado ao recarregar', await A.ev(`document.documentElement.classList.contains('vm-hearing')`) === true);
  await A.go(url('L9099-ART-65.html#texto-legal'), { wait: 800 });
  s.check('Modo audiência: link para seção oculta (#texto-legal) sai do modo', await A.ev(`!document.documentElement.classList.contains('vm-hearing')&&getComputedStyle(document.getElementById('texto-legal')).display!=='none'`) === true);
  await A.ev(`localStorage.removeItem('vadeMecum_hearing')`);
  await A.go(url('DP-ART-3.html'), { wait: 800 });
  s.check('Página sem seção de pontos recorrentes (DP-ART-3): sem botão de modo audiência', await A.ev(`!document.querySelector('.vm-dock [data-a=hearing]')`) === true);

  // ===== imprimir / PDF por seção =====
  await A.go(url('L9099-ART-65.html'), { wait: 900 });
  await A.ev(`window.__printed=0;window.print=()=>{window.__printed++};1`);
  await A.ev(`document.querySelector('#finalidade .vm-sec-pdf').click(),true`); await sleep(300);
  const pv = JSON.parse(await A.ev(`JSON.stringify({printed:window.__printed,hidden:document.querySelectorAll('[data-vm-hide-p]').length,head:document.querySelector('.vm-print-head').textContent,cls:document.documentElement.classList.contains('vm-printing')})`));
  s.check('PDF da seção: chama a impressão, isola a seção e monta cabeçalho com fonte e data', pv.printed === 1 && pv.hidden > 3 && pv.cls && pv.head.includes('art. 65') && pv.head.includes('14/11/2026') && pv.head.includes('Última conferência'), JSON.stringify(pv));
  await A.send('Emulation.setEmulatedMedia', { media: 'print' });
  const pr = JSON.parse(await A.ev(`JSON.stringify({target:getComputedStyle(document.getElementById('finalidade')).display,other:getComputedStyle(document.getElementById('panorama')).display,bar:getComputedStyle(document.getElementById('vm-study-bar')).display,dock:getComputedStyle(document.querySelector('.vm-dock')).display,head:getComputedStyle(document.querySelector('.vm-print-head')).display})`));
  s.check('Na impressão: só a seção escolhida + cabeçalho; barra, ferramentas e demais seções somem', pr.target !== 'none' && pr.other === 'none' && pr.bar === 'none' && pr.dock === 'none' && pr.head === 'block', JSON.stringify(pr));
  await A.send('Emulation.setEmulatedMedia', { media: '' });
  await A.ev(`window.dispatchEvent(new Event('afterprint'))`);
  s.check('Depois de imprimir, a página volta ao normal', await A.ev(`document.querySelectorAll('[data-vm-hide-p]').length===0&&!document.documentElement.classList.contains('vm-printing')`) === true);

  // ===== tempo na aba, nota, meta =====
  await A.go(url('L9099-ART-62.html'), { wait: 700 });
  await A.ev('localStorage.clear()');
  await A.go(url('L9099-ART-62.html'), { wait: 700 });
  const baseTitle = await A.ev('document.title');
  await A.click('#vm-btn-start'); await sleep(1500);
  const t1 = await A.ev('document.title');
  await A.click('#vm-btn-pause'); await sleep(700);
  const t2 = await A.ev('document.title');
  s.check('Título da aba mostra o tempo: "▶ mm:ss · título" lendo, "⏸ ..." em pausa', /^▶ \d\d:\d\d · /.test(t1) && t1.endsWith(baseTitle) && /^⏸ \d\d:\d\d · /.test(t2), `${t1} | ${t2}`);
  await A.click('#vm-btn-start'); await sleep(300);
  // sessão curta: sem pedido de nota
  await A.click('#vm-btn-end'); await sleep(400);
  s.check('Ao encerrar, o título volta ao original', (await A.ev('document.title')) === baseTitle);
  s.check('Sessão curta (<30 s) não pede nota', await A.ev(`!document.getElementById('vm-note')||document.getElementById('vm-note').style.display==='none'`) === true);
  // sessão longa: nota + meta
  await A.setLS({ vadeMecum_settings: { dailyGoalMin: 1, reviewDays: 90 } });
  await A.go(url('L9099-ART-62.html'), { wait: 700 });
  await A.click('#vm-btn-start'); await sleep(500);
  await A.ev(`(()=>{const a=JSON.parse(localStorage.getItem('vadeMecum_activeSession'));a.startTs-=90000;a.lastSeenTs=Date.now();localStorage.setItem('vadeMecum_activeSession',JSON.stringify(a))})()`);
  await sleep(700);
  await A.click('#vm-btn-end'); await sleep(500);
  const noteOpen = JSON.parse(await A.ev(`JSON.stringify({open:getComputedStyle(document.getElementById('vm-note')).display!=='none',focus:document.activeElement.id,label:document.getElementById('vm-note-l').textContent,toast:(document.getElementById('vm-toast')||{}).textContent})`));
  s.check('Sessão ≥30 s: pergunta pela nota (campo com foco) e avisa que a meta diária foi atingida', noteOpen.open && noteOpen.focus === 'vm-note-t' && noteOpen.label.includes('01:3') && (noteOpen.toast || '').includes('Meta diária atingida'), JSON.stringify(noteOpen));
  await A.ev(`(()=>{const t=document.getElementById('vm-note-t');t.value='Rever Súmula 523 <img src=x onerror=alert(1)>';document.querySelector('#vm-note [data-a=save]').click()})()`); await sleep(300);
  const sess = await A.getLS('vadeMecum_studySessions');
  s.check('Nota salva na sessão (texto bruto, sem executar HTML)', sess.length === 2 && sess[1].note === 'Rever Súmula 523 <img src=x onerror=alert(1)>', JSON.stringify(sess.map((x) => x.note)));
  s.check('Aviso de meta aparece só uma vez por dia', await A.getLS('vadeMecum_goalToastDay') === '2026-11-14', await A.getLS('vadeMecum_goalToastDay'));

  // ===== dashboard: nota escapada, meta, backup =====
  await A.go(url('index.html'), { wait: 1200 });
  const dash = JSON.parse(await A.ev(`(()=>{dbRefresh();const notes=[...document.querySelectorAll('#dbSessionsBody td.td-note')].map(x=>x.innerHTML);return JSON.stringify({noteHtml:notes.join(' | '),img:document.querySelectorAll('#dbSessionsBody img').length,goal:document.querySelector('#vde-goal .vde-txt').textContent,bar:document.querySelector('#vde-goal .vde-bar i').style.width,bk:document.querySelector('#vde-bk .vde-txt').textContent})})()`));
  s.check('Dashboard: nota exibida como TEXTO (HTML escapado; nenhum <img> injetado)', dash.img === 0 && dash.noteHtml.includes('&lt;img'), JSON.stringify(dash));
  s.check('Dashboard: meta diária mostra o progresso do dia', dash.goal.includes('de 1 min') && parseFloat(dash.bar) === 100, dash.goal + ' ' + dash.bar);
  s.check('Dashboard: avisa que não há backup e que os dados ficam só no navegador', dash.bk.includes('Nenhum backup') && dash.bk.includes('só neste navegador'), dash.bk);
  // backup: exportar
  await A.setLS({ vadeMecum_completedArticles: { 'L9099-ART-62': { subject: 'Lei 9.099/95', subjectId: 'L9099', articleNum: 62, completedAt: '2026-11-13T10:00:00.000Z' } } });
  const exp = await A.ev(`(async()=>{let blob;URL.createObjectURL=b=>{blob=b;return 'blob:x'};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};VMTracker.downloadBackup();return await blob.text()})()`);
  const bk = JSON.parse(exp);
  s.check('Backup: arquivo JSON com app, schema, sessões, concluídos e configurações', bk.app === 'vade-mecum' && bk.schema === 1 && bk.sessions.length === 2 && bk.completed['L9099-ART-62'] && bk.settings.dailyGoalMin === 1, Object.keys(bk).join(','));
  s.check('Backup: registra a data do último backup', (await A.getLS('vadeMecum_lastBackup')) > 0);
  // importar (função) em armazenamento limpo
  const imp = async (obj, mode) => JSON.parse(await A.ev(`JSON.stringify(VMTracker.importBackup(${JSON.stringify(obj)},${JSON.stringify(mode)}))`));
  await A.ev(`localStorage.removeItem('vadeMecum_studySessions');localStorage.removeItem('vadeMecum_completedArticles')`);
  let ir = await imp(bk, 'merge');
  s.check('Importar (somar) num navegador limpo: traz 2 sessões e 1 artigo concluído', ir.ok && ir.sessions.added === 2 && ir.completed.added === 1, JSON.stringify(ir));
  ir = await imp(bk, 'merge');
  s.check('Importar o mesmo arquivo de novo não duplica nada', ir.ok && ir.sessions.added === 0 && ir.completed.added === 0, JSON.stringify(ir));
  s.check('Os dados importados mantêm a nota', (await A.getLS('vadeMecum_studySessions'))[1].note.startsWith('Rever'));
  const evil = JSON.parse(JSON.stringify(bk));
  evil.sessions.push({ id: 'neg', state: 'done', startTs: Date.now(), totalStudyMs: -5, date: '2026-11-14' },
    { id: 'huge', state: 'done', startTs: Date.now(), totalStudyMs: 9e12, date: '2026-11-14' },
    { id: 'x'.repeat(500), state: 'done', startTs: Date.now(), totalStudyMs: 1000, date: '2026-11-14' },
    { id: 'baddate', state: 'done', startTs: Date.now(), totalStudyMs: 1000, date: 'amanhã' },
    { id: 'ok2', state: 'done', startTs: Date.now() - 86400000, totalStudyMs: 60000, date: '2026-11-13', note: 'n', extra: '<script>', __proto__x: 1 });
  evil.completed['DP-ART-1'] = { subjectId: 'CP' };
  // JSON malicioso "de verdade": chaves __proto__ e caminho como propriedades PRÓPRIAS (só existem vindas de texto JSON)
  const evilRaw = JSON.stringify(evil).replace('"completed":{', '"completed":{"__proto__":{"subjectId":"X","polluted":true},"../../etc":{"subjectId":"X"},');
  ir = JSON.parse(await A.ev(`JSON.stringify(VMTracker.importBackup(JSON.parse(${JSON.stringify(evilRaw)}),'merge'))`));
  const after = await A.getLS('vadeMecum_studySessions');
  s.check('Importar arquivo adulterado: ignora sessões inválidas (negativa, enorme, id/data ruins), aceita a válida', ir.ok && ir.sessions.ignored === 4 && ir.sessions.added === 1, JSON.stringify(ir));
  s.check('Importar: campos estranhos descartados e chaves perigosas (__proto__, caminhos) recusadas', !JSON.stringify(after).includes('<script>') && !JSON.stringify(await A.getLS('vadeMecum_completedArticles')).includes('etc') && (await A.ev(`({}).polluted===undefined&&({}).subjectId===undefined`)) === true);
  for (const [bad, why] of [[{ app: 'outro', schema: 1, sessions: [], completed: {} }, 'app errado'], [{ app: 'vade-mecum', schema: 99, sessions: [], completed: {} }, 'schema'], [{ app: 'vade-mecum', schema: 1, sessions: 'x', completed: {} }, 'sessions'], [[], 'array'], [null, 'null']]) {
    const r2 = await imp(bad, 'merge');
    s.check(`Importar recusa arquivo inválido (${why})`, r2.ok === false && !!r2.error, JSON.stringify(r2));
  }
  ir = await imp(bk, 'replace');
  s.check('Importar (substituir): o conteúdo passa a ser exatamente o do arquivo', ir.ok && (await A.getLS('vadeMecum_studySessions')).length === 2 && Object.keys(await A.getLS('vadeMecum_completedArticles')).length === 1);
  // fluxo pela interface: arquivo + janela de escolha
  await A.go(url('index.html'), { wait: 1000 });
  await A.ev(`localStorage.removeItem('vadeMecum_studySessions');localStorage.removeItem('vadeMecum_completedArticles')`);
  await A.ev(`(()=>{const f=new File([${JSON.stringify(exp)}],'b.json',{type:'application/json'});const dt=new DataTransfer();dt.items.add(f);const inp=document.querySelector('.db-actions input[type=file]');inp.files=dt.files;inp.dispatchEvent(new Event('change'))})()`);
  await sleep(700);
  const dlg = await A.ev(`(()=>{const m=document.querySelector('.vm-modal');return m?m.textContent:null})()`);
  s.check('Restaurar pela interface: abre a janela perguntando Somar / Substituir / Cancelar', !!dlg && dlg.includes('Somar') && dlg.includes('Substituir') && dlg.includes('2 sessões'), dlg);
  await A.ev(`document.querySelector('.vm-modal button').click(),true`); await sleep(600);
  s.check('...e "Somar" restaura os dados e atualiza a tela', (await A.getLS('vadeMecum_studySessions')).length === 2 && (await A.ev(`document.querySelector('#dbSessionsBody').textContent`)).includes('L9099-ART-62'));
  await A.ev(`(()=>{const f=new File(['isto não é json'],'x.json');const dt=new DataTransfer();dt.items.add(f);const inp=document.querySelector('.db-actions input[type=file]');inp.files=dt.files;inp.dispatchEvent(new Event('change'))})()`); await sleep(500);
  s.check('Arquivo que não é JSON: aviso e nada é alterado', (await A.getLS('vadeMecum_studySessions')).length === 2 && !(await A.ev(`!!document.querySelector('.vm-modal')`)));
  // backup antigo: alerta
  await A.setLS({ vadeMecum_lastBackup: String(Date.parse(FROZEN) - 20 * 86400000) });
  await A.go(url('index.html'), { wait: 1000 });
  s.check('Backup com mais de 14 dias: alerta em destaque', await A.ev(`document.getElementById('vde-bk').classList.contains('warn')`) === true);

  // ===== conferência a renovar =====
  const rev = JSON.parse(await A.ev(`JSON.stringify({txt:document.querySelector('#vde-rev .vde-txt').textContent,items:document.querySelectorAll('#vde-rev li').length,first:document.querySelector('#vde-rev li a').getAttribute('href')})`));
  s.check('Conferência a renovar: lista artigos vencidos/sem data exata, com link para abri-los', rev.items > 10 && /artigos? com conferência/.test(rev.txt) && /index-[a-z]+\.html\?art=/.test(rev.first), JSON.stringify(rev));
  await A.ev(`(()=>{const i=document.querySelector('#vde-rev input');i.value=400;document.querySelector('#vde-rev button').click()})()`); await sleep(300);
  s.check('Prazo configurável: com 400 dias a lista diminui', (await A.ev(`document.querySelectorAll('#vde-rev li').length`)) < rev.items);

  // ===== continuar de onde parou =====
  await A.go(url('index-jecrim.html?art=L9099-ART-62.html'), { wait: 1500 });
  await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;d.documentElement.style.scrollBehavior='auto';d.defaultView.scrollTo(0,3200)})()`);
  await sleep(1600);
  const lr = await A.getLS('vadeMecum_lastRead');
  s.check('Leitura: a posição é salva ao rolar (arquivo, seção e percentual)', lr && lr.file === 'L9099-ART-62.html' && lr.pct > 5 && !!lr.sec, JSON.stringify(lr));
  await A.go(url('index.html'), { wait: 1200 });
  const cont = JSON.parse(await A.ev(`JSON.stringify({hidden:document.querySelector('.vm-continue').hidden,txt:document.querySelector('.vm-continue').textContent,href:document.querySelector('.vm-continue a').getAttribute('href')})`));
  s.check('Home: cartão "Continuar de onde parou" com o artigo, o percentual e o link de retomada', !cont.hidden && cont.txt.includes('62') && cont.href === 'index-jecrim.html?art=L9099-ART-62.html&resume=1', JSON.stringify(cont));
  await A.ev(`document.querySelector('.vm-continue a').click(),true`); await sleep(2200);
  const y = await A.ev(`document.getElementById('painel_artigos').contentWindow.scrollY`);
  s.check('Retomar abre o artigo e volta para perto da posição salva', Math.abs(y - 3200) < 450 && y > 2000, 'scrollY=' + y);

  // ===== aviso de sessão em outro artigo =====
  await A.go(url('index-jecrim.html?art=L9099-ART-62.html'), { wait: 1500 });
  await A.ev(`localStorage.removeItem('vadeMecum_activeSession')`);
  await A.ev(`document.getElementById('painel_artigos').contentDocument.getElementById('vm-btn-start').click(),true`); await sleep(1500);
  const hid1 = await A.ev(`document.querySelector('.vm-session-banner').hidden`);
  await A.ev(`document.getElementById('painel_artigos').src='L9099-ART-63.html'`); await sleep(1800);
  const ban = JSON.parse(await A.ev(`JSON.stringify({hidden:document.querySelector('.vm-session-banner').hidden,txt:document.querySelector('.vm-session-banner').textContent})`));
  s.check('Aviso na barra lateral: oculto no artigo da sessão; aparece ao abrir OUTRO artigo, com o tempo', hid1 === true && ban.hidden === false && ban.txt.includes('art. 62') && /\d\d:\d\d/.test(ban.txt), JSON.stringify(ban));
  await A.ev(`document.querySelector('.vm-session-banner button').click(),true`); await sleep(1500);
  s.check('"Ir para o artigo" volta ao artigo da sessão; o aviso some', (await A.ev(`document.getElementById('painel_artigos').contentWindow.location.pathname`)).endsWith('L9099-ART-62.html') && (await A.ev(`document.querySelector('.vm-session-banner').hidden`)) === true);
  await A.go(url('index.html'), { wait: 1500 });
  s.check('Home: o aviso de sessão em andamento aparece', await A.ev(`!document.querySelector('.vm-session-banner').hidden`) === true);
  const topTitle = await A.ev('document.title');
  s.check('Título da aba da home não é alterado por quem não está estudando nela', !topTitle.startsWith('▶'), topTitle);

  s.done();
});
