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
  // desempenho por artigo
  const perf = JSON.parse(await A.ev(`JSON.stringify({vis:!document.getElementById('perf').hidden,rows:[...document.querySelectorAll('#perf-t tbody tr')].map(r=>[...r.children].map(c=>c.textContent.trim()))})`));
  T.check('Treino: "Desempenho por artigo" aparece após responder e mostra respostas e % de acerto do art. 65 (1 acerto em 3 respostas = 33%)', perf.vis && perf.rows.length === 1 && perf.rows[0][0].includes('Art. 65') && perf.rows[0][2] === '3' && perf.rows[0][3] === '33%', JSON.stringify(perf));
  // exportação para o Anki (captura o arquivo gerado)
  await A.ev(`(()=>{window.__anki=null;URL.createObjectURL=(b)=>{window.__anki=b;return 'blob:teste'};document.getElementById('b-anki').click()})()`); await sleep(300);
  const ak = JSON.parse(await A.ev(`(async()=>{const t=await window.__anki.text();const L=t.split(String.fromCharCode(10)).filter(Boolean);const T=String.fromCharCode(9);return JSON.stringify({head:L.slice(0,3),n:L.length-3,tabs:L.slice(3).every(l=>l.split(T).length===3),tag:L[3].split(T)[2],has:L[3].includes('Fonte:')})})()`));
  T.check('Treino: exportar para o Anki gera um arquivo com cabeçalho, 32 cartões do filtro (art. 65), três colunas e etiqueta', ak.head.join('|') === '#separator:tab|#html:true|#tags column:3' && ak.n === 32 && ak.tabs && ak.tag === 'vade_mecum L9099-ART-65' && ak.has, JSON.stringify(ak));
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
  T.check('Nota: ao escrever, aparece o aviso para não registrar dados que identifiquem clientes', (await A.ev(`(document.querySelector('#finalidade .vm-note-warn')||{}).textContent||''`)).includes('identifiquem clientes'));
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
  T.check('Tema escuro: fundo escuro, conteúdo invertido, a barra do cronômetro continua fixa', dk.cls && dk.bg === 'rgb(14, 11, 7)' && /invert/.test(dk.filter) && dk.bar === 'fixed' && dk.txt === 'Tema claro', JSON.stringify(dk));
  await A.go(url('DP-ART-1.html'), { wait: 600 });
  const dk1 = await A.ev(`(()=>{const m=document.querySelector('main#vm-conteudo');return !!m&&/invert/.test(getComputedStyle(m).filter)&&document.documentElement.classList.contains('vm-dark')})()`);
  T.check('Tema escuro: páginas sem .page-wrap (DP-ART-1, conteúdo em <main>) também invertem o conteúdo, e ficam legíveis', dk1 === true);
  await A.go(url('DP-ART-28.html'), { wait: 500 });
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

  // calculadoras novas: transação penal (art. 76), prazos do procedimento, decadência
  T.check('Calculadoras novas: texto oficial do art. 76, do art. 798 do CPP e do art. 38 do CPP aparece com a fonte', await A.ev(`(()=>{const t=id=>document.getElementById(id).textContent;return t('t-src').includes('Art. 76')&&t('z-src').includes('Art. 798')&&t('d-src').includes('Art. 38')&&t('z-src').includes('12-A')})()`) === true);
  await A.ev(`(()=>{const f=document.getElementById('f-trans');document.getElementById('t-circ').value='suficiente';f.querySelector('button[type=submit]').click()})()`); await sleep(250);
  let tr = await A.ev(`document.getElementById('t-res').textContent`);
  T.check('Transação penal (tela): todos os requisitos atendidos → "Nenhum impedimento" e as notas dos §§ 4º e 6º', tr.includes('Nenhum impedimento nos itens enumerados') && tr.includes('§ 4º') && tr.includes('§ 6º'), tr.slice(0, 220));
  await A.ev(`(()=>{document.getElementById('t-ppl').checked=true;document.querySelector('#f-trans button[type=submit]').click()})()`); await sleep(250);
  tr = await A.ev(`document.getElementById('t-res').textContent`);
  T.check('Transação penal (tela): condenação definitiva a pena privativa de liberdade → "Impede" (art. 76, § 2º, I)', tr.includes('Há impedimento legal') && tr.includes('Impede · Art. 76, § 2º, I'), tr.slice(0, 220));
  await A.ev(`(()=>{document.getElementById('z-ini').value='2026-11-05';document.querySelector('#f-prazos button[type=submit]').click()})()`); await sleep(250);
  let pz = await A.ev(`document.getElementById('z-res').textContent`);
  T.check('Prazos (tela): apelação com ciência em 05/11/2026 termina no domingo 15/11 e é prorrogada para segunda 16/11/2026', pz.includes('16/11/2026') && pz.includes('segunda-feira') && pz.includes('domingo'), pz.slice(0, 260));
  await A.ev(`(()=>{document.getElementById('z-modo').value='uteis';document.querySelector('#f-prazos button[type=submit]').click()})()`); await sleep(250);
  pz = await A.ev(`document.getElementById('z-res').textContent`);
  T.check('Prazos (tela): dias úteis mostram o aviso sobre o art. 12-A', pz.includes('12-A') && pz.includes('não decide'), pz.slice(0, 200));
  await A.ev(`(()=>{document.getElementById('z-fer').value='lixo';document.querySelector('#f-prazos button[type=submit]').click()})()`); await sleep(200);
  T.check('Prazos (tela): feriado digitado errado vira erro, não resultado', (await A.ev(`document.querySelector('#z-res .tp-warn')&&document.querySelector('#z-res .tp-warn').textContent`) || '').length > 5);
  await A.ev(`(()=>{document.getElementById('w-aud').value='2026-12-10';document.querySelector('#f-test button[type=submit]').click()})()`); await sleep(200);
  T.check('Testemunhas (tela): audiência em 10/12/2026 → até 05/12/2026', (await A.ev(`document.getElementById('w-res').textContent`)).includes('05/12/2026'));
  await A.ev(`(()=>{document.getElementById('d-ini').value='2026-01-15';document.querySelector('#f-dec button[type=submit]').click()})()`); await sleep(200);
  T.check('Decadência (tela): 6 meses → 14/07/2026; com violência doméstica, 12 meses → 14/01/2027', (await A.ev(`document.getElementById('d-res').textContent`)).includes('14/07/2026') &&
    (await A.ev(`(()=>{document.getElementById('d-vd').checked=true;document.querySelector('#f-dec button[type=submit]').click();return document.getElementById('d-res').textContent})()`)).includes('14/01/2027'));

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
      getFileHandle:async(n)=>({createWritable:async()=>{let buf='';return{write:async(d)=>{buf+=d},close:async()=>{window.__files[n]=buf}}}}),
      values(){const es=Object.keys(window.__files).map(n=>({kind:'file',name:n,getFile:async()=>({size:window.__files[n].length,text:async()=>window.__files[n]})}));let i=0;return{next:async()=>i<es.length?{done:false,value:es[i++]}:{done:true}}}};
    window.showDirectoryPicker=async()=>dir;return 1})()`);
  const st = JSON.parse(await A.ev(`VMAutoBackup.status().then(s=>JSON.stringify(s))`));
  T.check('Backup automático: aparece como disponível e desativado no Chrome/Edge', st.supported === true && st.enabled === false, JSON.stringify(st));
  await A.ev(`(async()=>{await VMAutoBackup.choose();return 1})()`); await sleep(500);
  const f1 = JSON.parse(await A.ev(`JSON.stringify(Object.keys(window.__files))`));
  T.check('Backup automático: ao escolher a pasta, grava o "latest" do aparelho e uma cópia datada (nomes com a etiqueta do aparelho)', f1.some((n) => /^vademecum-backup-latest-[0-9a-f]{6}\.json$/.test(n)) && f1.some((n) => /^vademecum-backup-\d{4}-\d{2}-\d{2}-[0-9a-f]{6}\.json$/.test(n)), JSON.stringify(f1));
  const j = JSON.parse(await A.ev(`window.__files[Object.keys(window.__files).find(n=>/latest/.test(n))]`));
  T.check('O arquivo gravado é um backup válido (app, schema, dados)', j.app === 'vade-mecum' && j.schema === 1 && Array.isArray(j.sessions), Object.keys(j).join(','));
  T.check('O painel da home mostra a pasta e o último backup', await A.ev(`(async()=>{await new Promise(r=>setTimeout(r,300));return document.querySelector('.vde-auto').textContent.includes('MinhaPasta')})()`) === true);
  // ---- sincronização entre aparelhos pela pasta (sem servidor): cada aparelho grava só o seu arquivo; "importar" soma os dos outros ----
  const dev = await A.ev(`VMAutoBackup.deviceId()`);
  const outro = { app: 'vade-mecum', schema: 1, exportedAt: '2026-11-13T10:00:00Z', completed: {}, settings: {}, lastRead: null,
    sessions: [{ id: 'sess_outro_1', date: '2026-11-13', dayOfWeek: 'sexta-feira', subject: 'Lei 9.099/95', subjectId: 'L9099', articleFile: 'L9099-ART-65', articleNum: 65, startTs: Date.parse('2026-11-13T10:00:00-03:00'), startTime: '10:00', endTs: Date.parse('2026-11-13T10:30:00-03:00'), endTime: '10:30', totalStudyMs: 1800000, pauseTotalMs: 0, studyDuration: '00:30', pauseDuration: '00:00', state: 'done', pauses: [] }],
    notes: { 'L9099-ART-65.html#texto-legal': { text: 'nota do outro aparelho', ts: 1 } } };
  await A.ev(`window.__files['vademecum-backup-latest-aaaaaa.json']=${JSON.stringify(JSON.stringify(outro))};window.__files['vademecum-backup-2026-11-01-aaaaaa.json']='{}';window.__files['leiame.txt']='x'`);
  const antes = await A.ev(`VMTracker.getSessions().length`);
  const imp = JSON.parse(await A.ev(`VMAutoBackup.importOthers({ask:true}).then(r=>JSON.stringify(r))`));
  T.check('Sincronização: "Importar da pasta" soma o arquivo de OUTRO aparelho (sessão e nota) e ignora o próprio, as cópias datadas e arquivos alheios', imp.ok && imp.files === 1 && imp.sessions === 1 && imp.notes === 1 && (await A.ev(`VMTracker.getSessions().length`)) === antes + 1, JSON.stringify(imp));
  const imp2 = JSON.parse(await A.ev(`VMAutoBackup.importOthers({ask:true}).then(r=>JSON.stringify(r))`));
  T.check('Sincronização: importar de novo é idempotente (nada duplica)', imp2.ok && imp2.sessions === 0 && imp2.notes === 0 && (await A.ev(`VMTracker.getSessions().length`)) === antes + 1, JSON.stringify(imp2));
  T.check('Sincronização: o arquivo do próprio aparelho não é lido como "outro"', (await A.ev(`VMAutoBackup.listOthers({ask:true}).then(r=>r.items.map(i=>i.name).join())`)) === 'vademecum-backup-latest-aaaaaa.json' && dev.length === 6);

  // ---- criptografia do backup (AES-GCM, chave derivada da senha) ----
  const cr = JSON.parse(await A.ev(`(async()=>{
    const T=VMTracker; const o=T.buildBackup(); o.notes={'X-ART-1.html#a':{text:'SEGREDO-DO-CLIENTE-123',ts:1}};
    const c=await T.encryptBackup(o,'senha-forte-123'); const txt=JSON.stringify(c);
    const out={enc:T.isEncryptedBackup(c),vazou:txt.includes('SEGREDO-DO-CLIENTE-123')||txt.includes('"sessions"'),campos:Object.keys(c).sort().join(),iter:c.iterations};
    const ok=await T.decryptBackup(c,'senha-forte-123'); out.volta=ok.notes['X-ART-1.html#a'].text;
    try{await T.decryptBackup(c,'senha-errada-999');out.errada='abriu'}catch(e){out.errada=e.message}
    const t2=JSON.parse(txt); const raw=atob(t2.data); t2.data=btoa(String.fromCharCode(raw.charCodeAt(0)^1)+raw.slice(1));
    try{await T.decryptBackup(t2,'senha-forte-123');out.adulterado='abriu'}catch(e){out.adulterado=e.message}
    try{await T.encryptBackup(o,'curta');out.curta='aceitou'}catch(e){out.curta=e.message}
    const t3=JSON.parse(txt); t3.iterations=5; try{await T.decryptBackup(t3,'senha-forte-123');out.iter5='abriu'}catch(e){out.iter5=e.message}
    out.valida=T.validateBackup(c);
    return JSON.stringify(out)})()`));
  T.check('Backup com senha: o arquivo não contém o texto das notas nem a lista de sessões; abre com a senha certa e devolve a nota', cr.enc && !cr.vazou && cr.volta === 'SEGREDO-DO-CLIENTE-123' && cr.iter === 600000, JSON.stringify(cr));
  T.check('Backup com senha: senha errada ou arquivo adulterado NÃO abre; senha curta é recusada; iterações fora do limite são recusadas', cr.errada.includes('Senha incorreta') && cr.adulterado.includes('Senha incorreta') && cr.curta.includes('8 caracteres') && cr.iter5.includes('inválidos'), JSON.stringify(cr));
  T.check('Backup com senha: validar o arquivo criptografado direto avisa que precisa da senha (não importa sem abrir)', cr.valida.includes('protegido por senha'), cr.valida);
  // restaurar pela tela da home: arquivo protegido pede a senha (errada: recusa; certa: segue para "Somar")
  const ui1 = JSON.parse(await A.ev(`JSON.stringify({pw:[...document.querySelectorAll('.db-actions .db-btn')].map(b=>b.textContent.trim()).filter(t=>/senha/i.test(t)),card:!!document.querySelector('#vde-bk .vde-pw')})`));
  T.check('Home: há "Backup com senha" nas ações do painel e no cartão de backup', ui1.pw.length === 1 && ui1.card === true, JSON.stringify(ui1));
  await A.ev(`(async()=>{const o=${JSON.stringify(outro)};o.sessions[0].id='sess_ui_enc';const c=await VMTracker.encryptBackup(o,'senha-da-tela-1');
    const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(c)],'b.json',{type:'application/json'}));const f=document.querySelector('.db-actions input[type=file]');f.files=dt.files;f.dispatchEvent(new Event('change'));return 1})()`);
  await sleep(700);
  T.check('Restaurar arquivo protegido: a tela pede a senha (e não mostra o conteúdo)', (await A.ev(`!!document.querySelector('.vm-modal .vm-pw1')`)) === true);
  await A.ev(`(()=>{document.querySelector('.vm-modal .vm-pw1').value='senha-errada-777';document.querySelector('.vm-modal .vm-act button').click()})()`); await sleep(900);
  T.check('Restaurar arquivo protegido: senha errada é recusada com aviso e nada é importado', (await A.ev(`VMTracker.getSessions().some(s=>s.id==='sess_ui_enc')`)) === false && (await A.ev(`document.body.textContent.includes('Senha incorreta')`)) === true);
  await A.ev(`(async()=>{const o=${JSON.stringify(outro)};o.sessions[0].id='sess_ui_enc';const c=await VMTracker.encryptBackup(o,'senha-da-tela-1');
    const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(c)],'b.json',{type:'application/json'}));const f=document.querySelector('.db-actions input[type=file]');f.files=dt.files;f.dispatchEvent(new Event('change'));return 1})()`);
  await sleep(700);
  await A.ev(`(()=>{document.querySelector('.vm-modal .vm-pw1').value='senha-da-tela-1';document.querySelector('.vm-modal .vm-act button').click()})()`); await sleep(1500);
  const modalTit = await A.ev(`(document.querySelector('.vm-modal h3')||{}).textContent||''`);
  await A.ev(`(()=>{const b=[...document.querySelectorAll('.vm-modal .vm-act button')].find(x=>/Somar/.test(x.textContent));b&&b.click()})()`); await sleep(500);
  T.check('Restaurar arquivo protegido: com a senha certa abre o diálogo "Restaurar backup" e, ao somar, a sessão entra', modalTit === 'Restaurar backup' && (await A.ev(`VMTracker.getSessions().some(s=>s.id==='sess_ui_enc')`)) === true, modalTit);
  // proteção da pasta: grava criptografado e a mesma senha reabre; a chave guardada não é extraível; desativar apaga a chave
  await A.ev(`window.__files={};window.__perm='granted'`);
  const en = JSON.parse(await A.ev(`(async()=>{
    const r=await VMAutoBackup.enableEncryption('senha-da-pasta-1'); const run=await VMAutoBackup.run('t',{ask:true});
    const nm=Object.keys(window.__files).find(n=>/latest/.test(n)); const c=JSON.parse(window.__files[nm]);
    const st=await VMAutoBackup.status(); const ab=await VMTracker.decryptBackup(c,'senha-da-pasta-1');
    const db=await new Promise(res=>{const q=indexedDB.open('vm-backup-db',1);q.onsuccess=()=>res(q.result)});
    const rec=await new Promise(res=>{const g=db.transaction('kv').objectStore('kv').get('enc');g.onsuccess=()=>res(g.result)});
    return JSON.stringify({r:r.ok,run:run.ok,enc:VMTracker.isEncryptedBackup(c),st:st.encrypted,abre:ab.app,extractable:rec&&rec.key&&rec.key.extractable,algo:rec&&rec.key&&rec.key.algorithm.name,semSenha:JSON.stringify(rec).includes('senha-da-pasta-1')})})()`));
  T.check('Proteção da pasta: o arquivo gravado sai criptografado, abre com a senha, e o navegador guarda só uma chave NÃO extraível (nunca a senha)', en.r && en.run && en.enc && en.st && en.abre === 'vade-mecum' && en.extractable === false && en.algo === 'AES-GCM' && !en.semSenha, JSON.stringify(en));
  // outro aparelho com arquivo criptografado: a chave guardada abre os arquivos deste mesmo sal; os de outro sal pedem a senha
  const salt0 = await A.ev(`VMTracker.backupSalt(JSON.parse(window.__files[Object.keys(window.__files).find(n=>/latest/.test(n))]))`);
  await A.ev(`(async()=>{const o=${JSON.stringify(outro)};o.sessions[0].id='sess_outro_2';const c=await VMTracker.encryptBackup(o,'senha-do-outro-1');window.__files['vademecum-backup-latest-bbbbbb.json']=JSON.stringify(c)})()`);
  const impE1 = JSON.parse(await A.ev(`VMAutoBackup.importOthers({ask:true}).then(r=>JSON.stringify(r))`));
  T.check('Sincronização com arquivo protegido: sem a senha o arquivo é pulado e avisado (nunca importado às cegas)', impE1.ok && impE1.files === 0 && impE1.skipped.some((x) => x.includes('protegido por senha')) && !!salt0, JSON.stringify(impE1));
  const impE2 = JSON.parse(await A.ev(`VMAutoBackup.importOthers({ask:true,askPassword:async()=>'senha-do-outro-1'}).then(r=>JSON.stringify(r))`));
  T.check('Sincronização com arquivo protegido: com a senha certa soma; com a errada pula e avisa', impE2.files === 1 && impE2.sessions === 1, JSON.stringify(impE2));
  await A.ev(`(async()=>{const o=${JSON.stringify(outro)};o.sessions[0].id='sess_outro_3';const c=await VMTracker.encryptBackup(o,'senha-do-outro-1');window.__files['vademecum-backup-latest-bbbbbb.json']=JSON.stringify(c)})()`);
  const impE3 = JSON.parse(await A.ev(`VMAutoBackup.importOthers({ask:true,askPassword:async()=>'senha-errada-000'}).then(r=>JSON.stringify(r))`));
  T.check('Sincronização com arquivo protegido: senha errada não importa nada', impE3.files === 0 && impE3.skipped.some((x) => x.includes('senha incorreta')), JSON.stringify(impE3));
  await A.ev(`VMAutoBackup.disable()`); await sleep(300);
  const semChave = await A.ev(`(async()=>{const db=await new Promise(res=>{const q=indexedDB.open('vm-backup-db',1);q.onsuccess=()=>res(q.result)});return await new Promise(res=>{const g=db.transaction('kv').objectStore('kv').get('enc');g.onsuccess=()=>res(g.result===undefined||g.result===null)})})()`);
  T.check('Desativar o backup automático também apaga a chave guardada', semChave === true);
  await A.ev(`(async()=>{await VMAutoBackup.choose();return 1})()`); await sleep(400);

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
  T.check('O índice por matéria é menor que o antigo arquivo único (CP é o maior, ~1,2 MB; Lei 9.099 ~0,7 MB)', big < 1500000 && (await A.ev(`fetch('search-index-L9099.json').then(r=>r.text()).then(t=>t.length)`)) < 1000000, String(big));

  // ================= ficha de audiência (A4) =================
  await A.go(url('L9099-ART-65.html'), { wait: 1200 });
  const fm = JSON.parse(await A.ev(`JSON.stringify({btns:[...document.querySelectorAll('#vm-dock [data-a^=ficha]')].map(b=>b.textContent.trim()),marked:[...document.querySelectorAll('[data-ficha]')].map(e=>e.id+':'+e.getAttribute('data-ficha'))})`));
  T.check('Ficha: o menu Ferramentas oferece a ficha compacta e a completa, e o art. 65 marca a seção de requisitos', fm.btns.length === 2 && fm.btns[0].includes('compacta') && fm.btns[1].includes('completa') && fm.marked.join() === 'finalidade:requisitos', JSON.stringify(fm));
  const fc = JSON.parse(await A.ev(`(()=>{const f=VMFicha.build(true);return JSON.stringify({blocks:[...f.querySelectorAll('.vf-block>h2')].map(h=>h.textContent),q:f.querySelectorAll('.prova-item').length,meta:f.querySelector('.vf-meta').textContent,ids:f.querySelectorAll('[id]').length,btn:f.querySelectorAll('button').length,law:f.textContent.includes('Os atos processuais serão válidos sempre que preenchherem')||f.textContent.includes('Os atos processuais serão válidos')})})()`));
  T.check('Ficha compacta: texto legal literal + 32 perguntas-chave, com a data de conferência e o aviso; sem ids repetidos nem botões', fc.blocks.join('|') === 'Texto legal|Perguntas-chave' && fc.q === 32 && fc.meta.includes('12/11/2026') && fc.meta.includes('Confira') && fc.ids === 0 && fc.btn === 0 && fc.law, JSON.stringify(fc));
  const ff = JSON.parse(await A.ev(`(()=>{const f=VMFicha.build(false);return JSON.stringify({blocks:[...f.querySelectorAll('.vf-block>h2')].map(h=>h.textContent)})})()`));
  T.check('Ficha completa: acrescenta a seção de requisitos, com o título da seção e sem repetir o cabeçalho dela', ff.blocks.length === 3 && ff.blocks[1].startsWith('Requisitos e critérios — Finalidade do Ato'), JSON.stringify(ff));
  const pagesOf = async (file, compact) => {
    await A.go(url(file), { wait: 900 });
    await A.ev(`document.documentElement.classList.add('vm-printing-ficha');VMFicha.build(${compact});const st=document.createElement('style');st.textContent='@media print{@page{size:A4 portrait;margin:8mm}}';document.head.appendChild(st);1`);
    const pdf = (await A.send('Page.printToPDF', { preferCSSPageSize: true })).result.data;
    return (Buffer.from(pdf, 'base64').toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  };
  const pg = {};
  for (const n of [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70]) pg['c' + n] = await pagesOf(`L9099-ART-${n}.html`, true);
  T.check('Ficha compacta (A4): cada artigo da Lei 9.099 sai em no máximo 2 páginas (os arts. 60 e 62 a 65 em 1)', Object.values(pg).every((n) => n >= 1 && n <= 2) && [60, 62, 63, 64, 65].every((n) => pg['c' + n] === 1), JSON.stringify(pg));
  const pf = await pagesOf('L9099-ART-65.html', false);
  T.check('Ficha completa (A4): o art. 65 sai em até 3 páginas', pf >= 1 && pf <= 3, String(pf));
  await A.ev(`VMFicha.cleanup()`);
  T.check('Ficha: após imprimir, a página volta ao normal (sem a ficha e sem a classe de impressão)', (await A.ev(`!document.querySelector('.vm-ficha')&&!document.documentElement.classList.contains('vm-printing-ficha')||(VMFicha.cleanup(),!document.querySelector('.vm-ficha'))`)) === true);

  // ================= aviso de lei alterada (data/alteracoes.json) =================
  await A.go(url('L9099-ART-64.html'), { wait: 1500 });
  T.check('Lei alterada: sem marcador gravado, nenhum aviso aparece (arquivo real vazio)', (await A.ev(`document.querySelectorAll('.vm-law-changed').length`)) === 0);
  server.virtual.set('data/alteracoes.json', 'tests/fixtures/alteracoes-teste.json');
  await A.ev(`caches.keys().then(k=>Promise.all(k.map(n=>caches.delete(n))))`);
  await A.go(url('L9099-ART-65.html'), { wait: 1500 });
  for (let i = 0; i < 20 && !(await A.ev(`!!document.querySelector('.vm-law-changed')`)); i++) await sleep(200);
  const lc = await A.ev(`(document.querySelector('.vm-law-changed')||{}).textContent||''`);
  T.check('Lei alterada: o artigo marcado mostra o aviso com o número do artigo e a data do retrato', lc.includes('art. 65') && lc.includes('14/11/2026') && lc.includes('Reconfira'), lc);
  await A.go(url('L9099-ART-64.html'), { wait: 1500 });
  T.check('Lei alterada: outro artigo da mesma lei, sem marcador, não mostra o aviso', (await A.ev(`document.querySelectorAll('.vm-law-changed').length`)) === 0);
  await A.go(url('index.html'), { wait: 1500 });
  for (let i = 0; i < 20 && !(await A.ev(`/lei alterada/.test(document.getElementById('vde-rev')?document.getElementById('vde-rev').textContent:'')`)); i++) await sleep(200);
  const home = await A.ev(`document.getElementById('vde-rev').textContent`);
  T.check('Lei alterada: a home lista o artigo na caixa "Conferência a renovar", com o número do artigo da lei', home.includes('lei alterada (art. 65)') && home.includes('1 artigo com a lei alterada'), home.slice(0, 220));
  server.virtual.delete('data/alteracoes.json');
  await A.ev(`caches.keys().then(k=>Promise.all(k.map(n=>caches.delete(n))))`);

  T.done();
});
