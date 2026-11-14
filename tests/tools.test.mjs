// Funcionalidades novas no navegador: treino com cartões, súmulas (registro), citações com aviso, notas e marcadores,
// tamanho de letra e tema escuro, calculadoras (tela), roteiro, painel da home (treino/fila/marcadores), backup com
// cartões/notas/marcadores, backup automático em pasta (com pasta simulada), busca por matéria em etapas.
import { run, suite, sleep } from './lib.mjs';

await run(async ({ base, server, browser }) => {
  const T = suite('Ferramentas novas');
  const A = await browser.newPage();
  const url = (f) => base + f;
  const FROZEN = '2026-11-14T12:00:00-03:00';
  await A.freezeDate(FROZEN);
  await A.go(url('index.html')); await A.ev('localStorage.clear()');

  // ================= treino =================
  await A.go(url('treino.html'), { wait: 800 });
  T.check('Treino: abre sem erro, sem 404, e lista os cartões e as matérias', A.errors.length === 0 && A.netErrors.length === 0 && (await A.ev(`document.querySelectorAll('#f-subj option').length`)) >= 2, [...A.errors, ...A.netErrors].join('|'));
  const st0 = await A.ev(`[...document.querySelectorAll('#stats .tr-stat b')].map(b=>+b.textContent)`);
  T.check('Treino: todos os cartões começam como "novos"', st0[0] > 500 && st0[1] === st0[0] && st0[2] === 0, JSON.stringify(st0));
  await A.ev(`(()=>{document.getElementById('f-subj').value='L9099';document.getElementById('f-subj').dispatchEvent(new Event('change'));document.getElementById('f-art').value='L9099-ART-65.html';document.getElementById('f-art').dispatchEvent(new Event('change'))})()`);
  const st1 = await A.ev(`[...document.querySelectorAll('#stats .tr-stat b')].map(b=>+b.textContent)`);
  T.check('Treino: filtrar o art. 65 da Lei 9.099 dá 32 cartões', st1[0] === 32 && st1[1] === 32, JSON.stringify(st1));
  await A.ev(`document.getElementById('f-new').value='9999';document.getElementById('f-mode').value='all'`);
  await A.click('#b-start'); await sleep(300);
  const c1 = JSON.parse(await A.ev(`JSON.stringify({area:!document.getElementById('area').hidden,q:document.getElementById('c-q').textContent,ansHidden:document.getElementById('c-a').hidden,group:document.getElementById('c-group').textContent,link:document.querySelector('#c-src a').getAttribute('href'),focus:document.activeElement.id})`));
  T.check('Treino: mostra pergunta, resposta oculta, grupo e link para o ponto no artigo; foco no botão', c1.area && c1.q.length > 5 && c1.ansHidden && c1.group.includes('Art. 65') && /index-jecrim\.html\?art=L9099-ART-65\.html&sec=recorrentes/.test(c1.link) && c1.focus === 'b-reveal', JSON.stringify(c1));
  await A.key(' ', 'Space', 32);
  const rv = await A.ev(`!document.getElementById('c-a').hidden&&document.getElementById('c-a-t').textContent.length>1&&document.getElementById('act-rate').hidden===false`);
  T.check('Treino: a barra de espaço revela a resposta e as opções de nota', rv === true);
  await A.key('3', 'Digit3', 51);
  let cards = await A.getLS('vadeMecum_cards');
  const ids = Object.keys(cards);
  T.check('Treino: tecla 3 (acertei) grava o cartão na caixa 1 com revisão em 1 dia (15/11/2026)', ids.length === 1 && cards[ids[0]].box === 1 && cards[ids[0]].due === '2026-11-15', JSON.stringify(cards));
  await A.key(' ', 'Space', 32); await A.key('1', 'Digit1', 49);
  cards = await A.getLS('vadeMecum_cards');
  const errou = Object.values(cards).find((c) => c.box === 0);
  T.check('Treino: tecla 1 (errei) volta o cartão à caixa 0 e para hoje', !!errou && errou.due === '2026-11-14', JSON.stringify(cards));
  await A.key(' ', 'Space', 32); await A.key('2', 'Digit2', 50);
  const dif = Object.values(await A.getLS('vadeMecum_cards')).filter((c) => c.due === '2026-11-15' && c.box === 0);
  T.check('Treino: tecla 2 (difícil) mantém a caixa e repete amanhã', dif.length === 1);
  // o cartão errado volta ao fim da fila uma vez
  const total = await A.ev(`document.getElementById('bar').style.width`);
  T.check('Treino: a barra de progresso anda', parseFloat(total) > 0, total);
  // revisão espaçada em dias seguintes (lógica do tracker com datas passadas)
  const sp = JSON.parse(await A.ev(`(()=>{const T=VMTracker;const d0=Date.parse('2026-01-10T12:00:00-03:00');T.rateCard('Z-ART-1.html#01','acertei',d0);const a=T.getCards()['Z-ART-1.html#01'];T.rateCard('Z-ART-1.html#01','acertei',d0+86400000);const b=T.getCards()['Z-ART-1.html#01'];T.rateCard('Z-ART-1.html#01','acertei',d0+4*86400000);const c=T.getCards()['Z-ART-1.html#01'];T.rateCard('Z-ART-1.html#01','errei',d0+11*86400000);const e=T.getCards()['Z-ART-1.html#01'];return JSON.stringify([a.due,a.box,b.due,b.box,c.due,c.box,e.due,e.box])})()`));
  T.check('Revisão espaçada: acertos agendam +1, +3 e +7 dias (caixas 1, 2, 3); erro volta à caixa 0', JSON.stringify(sp) === JSON.stringify(['2026-01-11', 1, '2026-01-14', 2, '2026-01-21', 3, '2026-01-21', 0]), JSON.stringify(sp));
  await A.ev(`(()=>{const c=VMTracker.getCards();delete c['Z-ART-1.html#01'];localStorage.setItem('vadeMecum_cards',JSON.stringify(c))})()`);
  // fim de sessão
  await A.go(url('treino.html?art=L9099-ART-60.html'), { wait: 800 });
  T.check('Treino: ?art= abre já filtrado no artigo, no modo "Todos"', (await A.ev(`document.getElementById('f-art').value`)) === 'L9099-ART-60.html' && (await A.ev(`document.getElementById('f-mode').value`)) === 'all');

  // ================= súmulas e registro =================
  await A.go(url('sumulas.html'), { wait: 900 });
  const sm = JSON.parse(await A.ev(`JSON.stringify({n:document.querySelectorAll('.sm-item').length,count:document.getElementById('count').textContent,s523:(()=>{const e=document.getElementById('STF-S-523');return e&&{badge:e.querySelector('.tp-badge').textContent,enun:e.querySelector('.sm-enun').textContent,fonte:e.querySelector('.tp-src a').href,mentions:e.querySelectorAll('.sm-men li').length}})(),stj:(()=>{const e=document.getElementById('STJ-S-536');return e&&{badge:e.querySelector('.tp-badge').textContent,hasEnun:!!e.querySelector('.sm-enun')}})(),s690:(()=>{const e=document.getElementById('STF-S-690');return e&&!!e.querySelector('.sm-obs')})()})`));
  T.check('Súmulas: lista os 54 precedentes citados; o texto oficial do STF aparece com fonte e onde é citada', sm.n >= 50 && sm.s523 && sm.s523.enun.startsWith('No processo penal, a falta da defesa') && sm.s523.fonte.includes('portal.stf.jus.br') && sm.s523.mentions >= 3, JSON.stringify(sm));
  T.check('Súmulas: as do STJ sem leitura oficial aparecem como "Enunciado não cadastrado", sem enunciado inventado', sm.stj && sm.stj.badge === 'Enunciado não cadastrado' && sm.stj.hasEnun === false, JSON.stringify(sm.stj));
  T.check('Súmula 690/STF: a observação de possível superação aparece', sm.s690 === true);
  await A.ev(`(()=>{const q=document.getElementById('f-q');q.value='defesa';q.dispatchEvent(new Event('input'))})()`);
  T.check('Súmulas: a busca por palavra do enunciado filtra a lista', (await A.ev(`document.querySelectorAll('.sm-item').length`)) < sm.n && (await A.ev(`document.querySelectorAll('.sm-item').length`)) >= 1);
  await A.go(url('sumulas.html?y=1#STF-SV-14'), { wait: 900 });   // endereço novo: recarrega sem o filtro anterior
  T.check('Súmulas: o link #STF-SV-14 destaca o precedente', await A.ev(`document.getElementById('STF-SV-14').classList.contains('hit')`) === true);

  // ================= citações nos artigos =================
  await A.go(url('L9099-ART-65.html'), { wait: 1200 });
  const ci = JSON.parse(await A.ev(`JSON.stringify({n:document.querySelectorAll('.vm-cite').length,ids:[...new Set([...document.querySelectorAll('.vm-cite')].map(e=>e.dataset.cite))].sort(),textoIntacto:document.querySelector('.vm-cite[data-cite="STF-S-523"]').textContent})`));
  T.check('Citações: súmulas e teses do artigo ficam sublinhadas (o texto não muda)', ci.n >= 10 && ci.ids.includes('STF-S-523') && ci.ids.includes('STJ-JT-69') && /Súmula 523/.test(ci.textoIntacto), JSON.stringify(ci));
  await A.ev(`document.querySelector('.vm-cite[data-cite="STF-S-523"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`); await sleep(300);
  const pop = JSON.parse(await A.ev(`(()=>{const p=document.getElementById('vm-cite-pop');return JSON.stringify({vis:!p.hidden,txt:p.textContent,links:[...p.querySelectorAll('a')].map(a=>a.getAttribute('href').slice(0,40))})})()`));
  T.check('Citações: o aviso mostra status, enunciado literal do STF e links para a fonte e para "onde aparece"', pop.vis && pop.txt.includes('Vigente') && pop.txt.includes('verificado em 14/11/2026') && pop.txt.includes('falta da defesa constitui nulidade absoluta') && pop.links.some((l) => l.includes('sumulas.html#STF-S-523')), JSON.stringify(pop));
  await A.ev(`document.querySelector('.vm-cite[data-cite="STJ-JT-69"]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}))`); await sleep(300);
  T.check('Citações sem leitura oficial avisam que o enunciado não está cadastrado', (await A.ev(`document.getElementById('vm-cite-pop').textContent`)).includes('Enunciado ainda não cadastrado'));
  // teclado
  await A.ev(`document.querySelector('.vm-cite[data-cite="STF-SV-35"]').focus()`); await sleep(300);
  T.check('Citações: o aviso também abre pelo teclado (foco) e fecha com Esc', (await A.ev(`!document.getElementById('vm-cite-pop').hidden`)) && (await A.key('Escape', 'Escape', 27), await A.ev(`document.getElementById('vm-cite-pop').hidden`)) === true);
  T.check('A cópia do texto continua sem os botões e sem o aviso (citações não poluem a cópia)', await A.ev(`(()=>{let got='';Object.defineProperty(navigator,'clipboard',{value:{writeText:t=>{got=t;return Promise.resolve()}},configurable:true});document.querySelector('.law-quote .vm-copy').click();return new Promise(r=>setTimeout(()=>r(!got.includes('Copiar')&&got.includes('— Fonte:')),200))})()`) === true);

  // ================= notas e marcadores =================
  await A.go(url('L9099-ART-65.html'), { wait: 1000 });
  await A.ev(`document.querySelector('#finalidade .vm-mark').click(),true`); await sleep(200);
  const mk = JSON.parse(await A.ev(`JSON.stringify({pressed:document.querySelector('#finalidade .vm-mark').getAttribute('aria-pressed'),txt:document.querySelector('#finalidade .vm-mark').textContent,store:Object.keys(JSON.parse(localStorage.getItem('vadeMecum_marks')))})`));
  T.check('Marcador: "Marcar" vira "Marcado", aria-pressed e grava por arquivo#seção', mk.pressed === 'true' && mk.txt === 'Marcado' && mk.store[0] === 'L9099-ART-65.html#finalidade', JSON.stringify(mk));
  await A.ev(`document.querySelector('#finalidade .vm-note-btn').click(),true`); await sleep(200);
  await A.ev(`(()=>{const t=document.querySelector('#finalidade + .vm-note-box textarea')||document.querySelector('#finalidade .vm-note-box textarea');t.value='Conferir a Súmula 523 <b>x</b>';[...document.querySelectorAll('.vm-note-box button')].find(b=>b.textContent==='Salvar').click()})()`); await sleep(200);
  const nt = JSON.parse(await A.ev(`JSON.stringify({store:JSON.parse(localStorage.getItem('vadeMecum_notes')),view:document.querySelector('#finalidade .vm-note-box p').textContent,html:document.querySelector('#finalidade .vm-note-box p').innerHTML,btn:document.querySelector('#finalidade .vm-note-btn').textContent})`));
  T.check('Nota: salva com a data, mostra como TEXTO (HTML escapado) e o botão indica "Nota (1)"', nt.store['L9099-ART-65.html#finalidade'].text.includes('<b>x</b>') && nt.view.includes('<b>x</b>') && nt.html.includes('&lt;b&gt;') && nt.btn === 'Nota (1)', JSON.stringify(nt));
  await A.go(url('L9099-ART-65.html'), { wait: 1000 });
  T.check('Marcador e nota permanecem ao recarregar a página', (await A.ev(`document.querySelector('#finalidade .vm-mark').textContent`)) === 'Marcado' && (await A.ev(`document.querySelector('#finalidade .vm-note-box p').textContent`)).includes('Conferir a Súmula 523'));
  await A.send('Emulation.setEmulatedMedia', { media: 'print' });
  T.check('Na impressão, notas, marcadores e botões não saem no papel', await A.ev(`getComputedStyle(document.querySelector('#finalidade .vm-note-box')).display==='none'&&getComputedStyle(document.querySelector('#finalidade .vm-sec-tools')).display==='none'`) === true);
  await A.send('Emulation.setEmulatedMedia', { media: '' });

  // ================= letra e tema =================
  await A.go(url('DP-ART-28.html'), { wait: 900 });
  const h0 = await A.ev(`document.querySelector('.page-wrap').getBoundingClientRect().height`);
  await A.ev(`document.querySelector('.vm-dock [data-a=font]').click(),true`); await sleep(200);
  const h1 = await A.ev(`document.querySelector('.page-wrap').getBoundingClientRect().height`);
  const fz = await A.ev(`document.querySelector('.vm-dock [data-a=font]').textContent`);
  T.check('Letra: o botão passa de 100% a 115% e o conteúdo cresce', fz === 'Letra 115%' && h1 > h0 * 1.05, `${h0} -> ${h1}`);
  await A.go(url('DP-ART-28.html'), { wait: 700 });
  T.check('Letra: o tamanho é lembrado ao recarregar (aplicado antes da página aparecer)', (await A.ev(`document.documentElement.classList.contains('vm-zoom')`)) === true && (await A.ev(`getComputedStyle(document.documentElement).getPropertyValue('--vm-zoom').trim()`)) === '1.15');
  await A.ev(`document.querySelector('.vm-dock [data-a=theme]').click(),true`); await sleep(300);
  const dk = JSON.parse(await A.ev(`JSON.stringify({cls:document.documentElement.classList.contains('vm-dark'),bg:getComputedStyle(document.body).backgroundColor,filter:getComputedStyle(document.querySelector('.page-wrap')).filter,bar:getComputedStyle(document.getElementById('vm-study-bar')).position,txt:document.querySelector('.vm-dock [data-a=theme]').textContent})`));
  T.check('Tema escuro: fundo escuro, conteúdo invertido, a barra do cronômetro continua fixa', dk.cls && dk.bg === 'rgb(21, 18, 13)' && /invert/.test(dk.filter) && dk.bar === 'fixed' && dk.txt === 'Tema claro', JSON.stringify(dk));
  const dkPro = await A.ev(`getComputedStyle(document.querySelector('.prova-section')).filter`);
  T.check('Tema escuro: a seção de pontos recorrentes (já escura) é re-invertida', /invert\(1\)/.test(dkPro), dkPro);
  await A.go(url('DP-ART-28.html'), { wait: 700 });
  T.check('Tema escuro é lembrado ao recarregar', await A.ev(`document.documentElement.classList.contains('vm-dark')`) === true);
  await A.ev(`localStorage.removeItem('vadeMecum_ui')`);

  // ================= calculadoras (tela) =================
  await A.go(url('calculadoras.html'), { wait: 1200 });
  T.check('Calculadoras: abre sem erro/404 e carrega o texto oficial (Planalto) dos dispositivos', A.errors.length === 0 && A.netErrors.length === 0 && (await A.ev(`document.querySelectorAll('#p-src details').length`)) >= 7, [...A.errors, ...A.netErrors].join('|'));
  await A.ev(`(()=>{const s=(id,v)=>{const e=document.getElementById(id);e.value=v;};document.getElementById('p-modo').value='abstrata';s('p-a','4');s('p-m','0');s('p-d','0');s('p-ini','2020-01-10');s('p-ref','2028-01-09');document.querySelector('#p-evs input[type=date]').value='';document.querySelector('#f-presc button[type=submit]').click()})()`); await sleep(300);
  let pr = await A.ev(`document.getElementById('p-res').textContent`);
  T.check('Calculadora de prescrição: máximo de 4 anos → 8 anos; sem marcos, termina em 09/01/2028 e ainda não prescreveu em 09/01/2028', pr.includes('Prazo prescricional: 8 anos') && pr.includes('termina em 09/01/2028') && pr.includes('Não prescreveu'), pr.slice(0, 300));
  await A.ev(`(()=>{document.getElementById('p-ref').value='2028-01-10';document.querySelector('#f-presc button[type=submit]').click()})()`); await sleep(300);
  pr = await A.ev(`document.getElementById('p-res').textContent`);
  T.check('Calculadora de prescrição: no dia seguinte, prescrição em 09/01/2028', pr.includes('prescrição em 09/01/2028') && pr.includes('PRESCREVEU'), pr.slice(0, 260));
  await A.ev(`(()=>{document.getElementById('p-m21').checked=true;document.getElementById('p-vs').checked=true;document.querySelector('#f-presc button[type=submit]').click()})()`); await sleep(300);
  pr = await A.ev(`document.getElementById('p-res').textContent`);
  T.check('Calculadora: violência sexual contra a mulher afasta a redução do art. 115 e avisa', pr.includes('Prazo prescricional: 8 anos') && pr.includes('violência sexual'), pr.slice(0, 200));
  await A.ev(`(()=>{document.getElementById('s-a').value='0';document.getElementById('s-m').value='11';document.getElementById('s-d').value='0';document.getElementById('s-cont').checked=true;document.querySelector('#f-scpp button[type=submit]').click()})()`); await sleep(300);
  const sc = await A.ev(`document.getElementById('s-res').textContent`);
  T.check('Calculadora da suspensão do processo: crime continuado com mínima de 11 meses não cabe (Súmula 723/STF)', sc.includes('acima do limite') && sc.includes('Súmula 723/STF'), sc.slice(0, 260));
  T.check('Calculadora mostra o enunciado oficial da Súmula 723/STF (do registro)', (await A.ev(`document.getElementById('s-src').textContent`)).includes('suspensão condicional do processo por crime continuado'));
  await A.ev(`(()=>{document.getElementById('o-a').value='2';document.getElementById('o-m').value='0';document.getElementById('o-d').value='1';document.querySelector('#f-menor button[type=submit]').click()})()`); await sleep(300);
  T.check('Calculadora do art. 61: 2 anos e 1 dia não é menor potencial ofensivo', (await A.ev(`document.getElementById('o-res').textContent`)).includes('Não é infração de menor potencial'));
  await A.ev(`(()=>{document.getElementById('p-a').value='-3';document.querySelector('#f-presc button[type=submit]').click()})()`); await sleep(200);
  T.check('Calculadora: valor negativo vira mensagem de erro, não resultado', (await A.ev(`document.querySelector('#p-res .tp-warn').textContent`)).length > 5);

  // ================= roteiro =================
  await A.go(url('index-jecrim.html'), { wait: 1000 });
  T.check('Roteiro aparece no menu da Lei 9.099 e abre no quadro, sem o cabeçalho duplicado', await A.ev(`(()=>{const a=document.querySelector('.menu-artigos a[href="L9099-ROTEIRO.html"]');return !!a&&!a.classList.contains('em-breve')})()`) === true);
  await A.ev(`document.querySelector('.menu-artigos a[href="L9099-ROTEIRO.html"]').click(),true`); await sleep(1500);
  const rt = JSON.parse(await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;return JSON.stringify({steps:d.querySelectorAll('.rt-step').length,top:getComputedStyle(d.querySelector('.tp-top')).display,art76:d.querySelector('#art-76 .rt-law').textContent.trim().slice(0,80),soon:d.querySelectorAll('.rt-soon').length>10,h1:d.querySelectorAll('h1').length})})()`));
  T.check('Roteiro: 27 passos com o texto da lei; cabeçalho próprio oculto dentro do quadro', rt.steps === 27 && rt.top === 'none' && rt.art76.startsWith('Art. 76. Havendo representação') && rt.soon && rt.h1 === 1, JSON.stringify(rt));
  await A.go(url('L9099-ROTEIRO.html'), { wait: 800 });
  T.check('Roteiro: aberto direto, mostra o cabeçalho de ferramentas', (await A.ev(`getComputedStyle(document.querySelector('.tp-top')).display`)) !== 'none' && A.errors.length === 0);
  await A.go(url('L9099-ART-62.html'), { wait: 800 });
  const pn = await A.ev(`(document.querySelector('.vm-pn-prev')||{}).getAttribute&&document.querySelector('.vm-pn-prev').getAttribute('href')`);
  T.check('O roteiro não entra no "anterior/próximo" dos artigos', pn === 'L9099-ART-61.html');

  // ================= home: treino, marcadores, fila =================
  await A.go(url('index.html'), { wait: 1500 });
  const hm = JSON.parse(await A.ev(`JSON.stringify({train:document.querySelector('#vde-train .vde-txt').textContent,marks:document.querySelector('#vde-marks .vde-txt').textContent,mItems:[...document.querySelectorAll('#vde-marks li')].map(l=>l.textContent),queue:document.querySelectorAll('#vde-queue li').length,qtxt:document.querySelector('#vde-queue .vde-txt').textContent,nav:[...document.querySelectorAll('#top-nav a')].map(a=>a.getAttribute('href')).filter(h=>/html$/.test(h))})`));
  T.check('Home: cartão de treino mostra cartões novos e para revisar hoje', /cartões: \d+ novos e \d+ para revisar hoje/.test(hm.train), hm.train);
  T.check('Home: marcadores e notas listados com o texto da nota', hm.mItems.length >= 1 && hm.mItems[0].includes('marcado') && hm.mItems[0].includes('Conferir a Súmula 523'), JSON.stringify(hm.mItems));
  T.check('Home: fila de redação lista 8 itens e avisa que as citações são só indício', hm.queue === 8 && hm.qtxt.includes('indício'), hm.qtxt.slice(0, 160));
  T.check('Home: menu leva a Treino, Súmulas e Calculadoras', ['treino.html', 'sumulas.html', 'calculadoras.html'].every((h) => hm.nav.includes(h)), JSON.stringify(hm.nav));
  T.check('Home: sem erro de JS nem 404', A.errors.length === 0 && A.netErrors.length === 0, [...A.errors, ...A.netErrors].join('|'));

  // ================= backup com cartões, notas e marcadores =================
  const bk = JSON.parse(await A.ev(`JSON.stringify(VMTracker.buildBackup())`));
  T.check('Backup inclui cartões, notas e marcadores', Object.keys(bk.cards).length >= 3 && Object.keys(bk.notes).length === 1 && Object.keys(bk.marks).length === 1, Object.keys(bk).join(','));
  await A.ev(`localStorage.removeItem('vadeMecum_cards');localStorage.removeItem('vadeMecum_notes');localStorage.removeItem('vadeMecum_marks')`);
  const ir = JSON.parse(await A.ev(`JSON.stringify(VMTracker.importBackup(${JSON.stringify(bk)},'merge'))`));
  T.check('Importar devolve cartões, notas e marcadores', ir.ok && ir.cards.added >= 3 && ir.notes.added === 1 && ir.marks.added === 1, JSON.stringify(ir));
  const bad = JSON.parse(JSON.stringify(bk));
  bad.cards = { 'X-ART-1.html#01': { box: 9, due: '2026-01-01' }, '../x#1': { box: 1, due: '2026-01-01' }, 'L9099-ART-65.html#01': { box: 2, due: 'ontem' }, 'L9099-ART-65.html#02': { box: 2, due: '2026-02-02', seen: 3, ok: 2, last: 5 } };
  bad.notes = { 'L9099-ART-65.html#x': { text: '' }, '<img>#y': { text: 'a' }, 'L9099-ART-62.html#z': { text: 'boa', ts: 7 } };
  bad.marks = { 'L9099-ART-65.html#ok': 5, 'drop table': 1, 'L9099-ART-65.html#str': 'x' };
  await A.ev(`localStorage.removeItem('vadeMecum_cards');localStorage.removeItem('vadeMecum_notes');localStorage.removeItem('vadeMecum_marks')`);
  const ir2 = JSON.parse(await A.ev(`JSON.stringify(VMTracker.importBackup(${JSON.stringify(bad)},'merge'))`));
  T.check('Importar valida cartões, notas e marcadores: só entra o que é válido', ir2.cards.added === 1 && ir2.notes.added === 1 && ir2.marks.added === 1, JSON.stringify(ir2));

  // ================= backup automático em pasta =================
  await A.go(url('index.html'), { wait: 1000 });
  await A.ev(`(()=>{
    window.__files={};window.__perm='granted';
    const dir={name:'MinhaPasta',queryPermission:async()=>window.__perm,requestPermission:async()=>{window.__perm='granted';return 'granted'},
      getFileHandle:async(n)=>({createWritable:async()=>{let buf='';return{write:async(d)=>{buf+=d},close:async()=>{window.__files[n]=buf}}}})};
    window.showDirectoryPicker=async()=>dir;return 1})()`);
  const st = JSON.parse(await A.ev(`VMAutoBackup.status().then(s=>JSON.stringify(s))`));
  T.check('Backup automático: aparece como disponível e desativado no Chrome/Edge', st.supported === true && st.enabled === false, JSON.stringify(st));
  await A.ev(`(async()=>{await VMAutoBackup.choose();return 1})()`); await sleep(500);
  const f1 = JSON.parse(await A.ev(`JSON.stringify(Object.keys(window.__files))`));
  T.check('Backup automático: ao escolher a pasta, grava o "latest" e uma cópia datada', f1.includes('vademecum-backup-latest.json') && f1.some((n) => /^vademecum-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)), JSON.stringify(f1));
  const j = JSON.parse(await A.ev(`window.__files['vademecum-backup-latest.json']`));
  T.check('O arquivo gravado é um backup válido (app, schema, dados)', j.app === 'vade-mecum' && j.schema === 1 && Array.isArray(j.sessions), Object.keys(j).join(','));
  T.check('O painel da home mostra a pasta e o último backup', await A.ev(`(async()=>{await new Promise(r=>setTimeout(r,300));return document.querySelector('.vde-auto').textContent.includes('MinhaPasta')})()`) === true);
  await A.ev(`window.__files={};window.__perm='prompt';VMAutoBackup.run('t').then(r=>window.__r=r)`); await sleep(300);
  T.check('Sem permissão (Chrome pediu de novo): não grava e diz "sem-permissao", sem erro', (await A.ev(`window.__r.why`)) === 'sem-permissao' && (await A.ev(`Object.keys(window.__files).length`)) === 0);
  await A.ev(`VMAutoBackup.run('t',{ask:true}).then(r=>window.__r=r)`); await sleep(300);
  T.check('Com clique do usuário (ask) pede a permissão e grava', (await A.ev(`window.__r.ok`)) === true && (await A.ev(`Object.keys(window.__files).length`)) >= 1);
  await A.ev(`window.__files={};window.dispatchEvent(new CustomEvent('vm:session-saved'))`);
  T.check('Backup automático dispara depois de uma sessão salva (com atraso de 20 s, não imediato)', (await A.ev(`Object.keys(window.__files).length`)) === 0);
  await A.ev(`VMAutoBackup.disable()`); await sleep(300);
  T.check('Desativar remove a pasta guardada', JSON.parse(await A.ev(`VMAutoBackup.status().then(s=>JSON.stringify(s))`)).enabled === false);
  const noApi = JSON.parse(await A.ev(`(()=>{delete window.showDirectoryPicker;return VMAutoBackup.supported()})()`));
  T.check('Sem a API (Firefox/Safari/celular): informa que não é suportado', noApi === false);

  // ================= lembrete semanal =================
  await A.ev(`localStorage.removeItem('vadeMecum_remindDay');localStorage.removeItem('vadeMecum_autoBackup');localStorage.setItem('vadeMecum_lastBackup',String(Date.now()-9*86400000))`);
  await A.go(url('index.html'), { wait: 1500 });
  const rem = await A.ev(`(()=>{const e=[...document.querySelectorAll('div[role=status]')].find(x=>x.textContent.includes('Faz mais de 7 dias'));return e?e.textContent:null})()`);
  T.check('Lembrete semanal: sem pasta automática e backup com mais de 7 dias, a home avisa (uma vez por dia)', !!rem && rem.includes('só neste navegador'), rem);
  await A.go(url('index.html'), { wait: 1200 });
  T.check('...e não repete no mesmo dia', await A.ev(`![...document.querySelectorAll('div[role=status]')].some(x=>x.textContent.includes('Faz mais de 7 dias'))`) === true);

  // ================= busca por matéria =================
  await A.go(url('L9099-ART-65.html'), { wait: 900 });
  await A.ctrlK(); await A.type('nulidade'); await sleep(900);
  // ordem pelo registro de recursos do navegador (o service worker já guardou os arquivos, então o servidor não vê os pedidos)
  const order = JSON.parse(await A.ev(`JSON.stringify(performance.getEntriesByType('resource').filter(e=>/search-index-/.test(e.name)).sort((a,b)=>a.startTime-b.startTime).map(e=>e.name.split('/').pop()))`));
  T.check('Busca: carrega primeiro o índice da matéria da página (Lei 9.099) e só depois as outras', order[0] === 'search-index-L9099.json' && order.length === 4, JSON.stringify(order));
  T.check('Busca: já mostra resultados depois do primeiro índice, e o aviso some quando todas as matérias chegam', (await A.ev(`document.querySelectorAll('#vs-list .vs-item').length`)) > 0 && (await A.ev(`document.querySelector('#vm-search .vs-foot').textContent.includes('navegar')`)) === true);
  const big = await A.ev(`fetch('search-index-CP.json').then(r=>r.text()).then(t=>t.length)`);
  T.check('O índice por matéria é menor que o antigo arquivo único (CP é o maior, ~1,2 MB; Lei 9.099 ~0,4 MB)', big < 1500000 && (await A.ev(`fetch('search-index-L9099.json').then(r=>r.text()).then(t=>t.length)`)) < 600000, String(big));

  T.done();
});
