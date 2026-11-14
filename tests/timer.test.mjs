// Cronômetro: iniciar/pausar/retomar/encerrar, recarregar, sessão abandonada, troca de artigo, duas abas,
// sem localStorage, CSV, dashboard e iframe. Cliques reais num navegador sem interface.
import { run, suite, sleep, secs } from './lib.mjs';

await run(async ({ base, browser }) => {
  const T = suite('Cronômetro');
  const url = (f) => base + f;
  const A = await browser.newPage();
  const ART = 'L9099-ART-65.html';
  const sessions = (P = A) => P.sessions();
  const active = (P = A) => P.active();
  const fs = null;
  // ============ F0: estado inicial ============
  await A.go(url(ART)); await A.ev('localStorage.clear()'); await A.go(url(ART));
  let u = await A.ui();
  T.check('F0 estado inicial', u.timer === '00:00:00' && u.status === 'Parado' && !u.startDis && u.pauseDis && u.endDis, JSON.stringify(u));
  T.check('F0 sem erros JS ao carregar', A.errors.length === 0, A.errors.join(' | '));

  // ============ F: basico (T2-T4) ============
  await A.click('#vm-btn-start'); await sleep(3200);
  u = await A.ui();
  T.check('T2 iniciar: Estudando e ~3s', u.status === 'Estudando' && secs(u.timer) >= 2 && secs(u.timer) <= 4 && u.startDis && !u.pauseDis && !u.endDis, JSON.stringify(u));
  let a = await active();
  T.check('T2 sessao gravada com lastSeenTs', a && a.state === 'reading' && typeof a.lastSeenTs === 'number');
  await A.click('#vm-btn-pause'); await sleep(2300);
  u = await A.ui(); const frozen = u.timer;
  T.check('T3 pausa: timer congelado e pausa em MM:SS', u.status === 'Pausado' && /^⏸ 00:0[1-4]$/.test(u.pause) && u.start.includes('Retomar'), JSON.stringify(u));
  await sleep(1200);
  T.check('T3 timer nao avanca em pausa', (await A.ui()).timer === frozen);
  await A.click('#vm-btn-start'); await sleep(2200);
  u = await A.ui();
  T.check('T4 retomar: ~5s de estudo (sem contar pausa)', secs(u.timer) >= 4 && secs(u.timer) <= 6 && u.pause === '', JSON.stringify(u));

  // ============ FALHA 4: reload lendo com pausa previa ============
  a = await active();
  await A.go(url(ART), { wait: 900 });
  u = await A.ui(); a = await active();
  const expectedRead = (Date.now() - a.startTs - a.pauseTotalMs) / 1000;
  T.check('F4 reload lendo: tempo = estudo (nao inclui pausa)', Math.abs(secs(u.timer) - expectedRead) <= 1.6 && u.status === 'Estudando', `tela=${u.timer} esperado~${expectedRead.toFixed(1)}s pausa=${(a.pauseTotalMs / 1000).toFixed(1)}s`);

  // ============ FALHA 3: reload em pausa ============
  await A.click('#vm-btn-pause'); await sleep(1500);
  const before = await A.ui();
  await A.go(url(ART), { wait: 900 });
  u = await A.ui();
  T.check('F3 reload pausado: timer preservado', u.status === 'Pausado' && u.timer === before.timer && /^⏸ 00:0\d$/.test(u.pause), `antes=${before.timer} depois=${u.timer} pausa=${u.pause}`);
  await A.click('#vm-btn-start'); await sleep(1500);
  await A.click('#vm-btn-end'); await sleep(300);
  u = await A.ui(); let ss = await sessions(); let s = ss[ss.length - 1];
  T.check('F3 tela final = valor gravado (+-1s)', Math.abs(secs(u.timer) - s.totalStudyMs / 1000) <= 1.01 && u.status.startsWith('Conclu'), `tela=${u.timer} gravado=${(s.totalStudyMs / 1000).toFixed(2)}s`);
  T.check('F3 sessao: 2 pausas, estudo>0, ativa removida', s.pauses.length === 2 && s.totalStudyMs > 0 && (await active()) === null);

  // ============ Nova ============
  await A.click('#vm-btn-start'); await sleep(200);
  u = await A.ui();
  T.check('T8 "Nova" volta ao estado inicial', u.status === 'Parado' && u.timer === '00:00:00' && !u.startDis);

  // ============ FALHA 2: troca de artigo ============
  await A.go(url('L9099-ART-64.html'));
  await A.click('#vm-btn-start'); await sleep(2600);
  const s64 = await active();
  await A.go(url(ART));
  u = await A.ui();
  T.check('F2 pagina nova ignora sessao de outro artigo (idle)', u.status === 'Parado' && (await active()).id === s64.id);
  await A.click('#vm-btn-start'); await sleep(500);
  ss = await sessions(); const saved64 = ss.find(x => x.id === s64.id);
  T.check('F2 sessao do art. 64 foi SALVA', !!saved64 && saved64.state === 'done' && saved64.totalStudyMs >= 2000 && saved64.autoClosed === true, saved64 ? `estudo=${saved64.totalStudyMs}ms motivo=${saved64.autoClosedReason}` : 'nao encontrada');
  const t2 = await A.toast();
  T.check('F2 aviso ao usuario', !!t2 && t2.includes('art. 64'), t2);
  T.check('F2 sessao ativa agora e a do art. 65', (await active()).articleFile === 'L9099-ART-65');
  await A.click('#vm-btn-end'); await sleep(200);

  // ============ FALHA 1: sessao abandonada ============
  await A.go(url(ART));
  const t0 = Date.now(), DAY = 86400000;
  await A.ev(`localStorage.setItem('vadeMecum_activeSession', JSON.stringify({id:'sess_old_${ART}',date:'2026-11-10',dayOfWeek:'terça-feira',subject:'Lei 9.099/95',subjectId:'L9099',articleFile:'L9099-ART-65',articleNum:65,startTs:${t0 - 3 * DAY - 3600000},startTime:'10:00',pauses:[],pauseTotalMs:0,lastSeenTs:${t0 - 3 * DAY},endTs:null,endTime:null,totalStudyMs:null,state:'reading'}))`);
  const nBefore = (await sessions()).length;
  await A.go(url(ART), { wait: 900 });
  u = await A.ui(); ss = await sessions(); s = ss.find(x => x.id === 'sess_old_' + ART);
  T.check('F1 abandonada: tela volta a "Parado" (nao 72h)', u.status === 'Parado' && u.timer === '00:00:00', JSON.stringify(u));
  T.check('F1 abandonada: gravada ate o ultimo sinal (1h), nao 73h', !!s && s.autoClosed && s.autoClosedReason === 'inatividade' && Math.abs(s.totalStudyMs - 3600000) < 1500, s ? `estudo=${(s.totalStudyMs / 3600000).toFixed(3)}h` : 'nao gravada');
  T.check('F1 abandonada: aviso ao usuario', !!(await A.toast()), await A.toast());
  T.check('F1 abandonada: ativa removida', (await active()) === null && (await sessions()).length === nBefore + 1);
  // sessao legada (sem lastSeenTs) muito antiga: descartada
  await A.ev(`localStorage.setItem('vadeMecum_activeSession', JSON.stringify({id:'sess_legacy',date:'2026-11-10',dayOfWeek:'terça-feira',subject:'Lei 9.099/95',subjectId:'L9099',articleFile:'L9099-ART-65',articleNum:65,startTs:${t0 - 3 * DAY},startTime:'10:00',pauses:[],pauseTotalMs:0,endTs:null,endTime:null,totalStudyMs:null,state:'reading'}))`);
  const nb2 = (await sessions()).length;
  await A.go(url(ART), { wait: 900 });
  T.check('F1 legada antiga: descartada, sem inflar horas', (await active()) === null && (await sessions()).length === nb2 && (await A.ui()).status === 'Parado');
  // sessao legada recente (sem lastSeenTs) continua valida
  await A.ev(`localStorage.setItem('vadeMecum_activeSession', JSON.stringify({id:'sess_legacy2',date:'2026-11-13',dayOfWeek:'sexta-feira',subject:'Lei 9.099/95',subjectId:'L9099',articleFile:'L9099-ART-65',articleNum:65,startTs:${Date.now() - 600000},startTime:'10:00',pauses:[],pauseTotalMs:0,endTs:null,endTime:null,totalStudyMs:null,state:'reading'}))`);
  await A.go(url(ART), { wait: 900 });
  u = await A.ui();
  T.check('F1 legada recente (10 min): restaurada', u.status === 'Estudando' && secs(u.timer) >= 599 && secs(u.timer) <= 603, JSON.stringify(u));
  await A.click('#vm-btn-end'); await sleep(200);

  // ============ sessao ausente (dados limpos) ============
  await A.go(url(ART));
  await A.click('#vm-btn-start'); await sleep(800);
  await A.ev(`localStorage.removeItem('vadeMecum_activeSession')`);
  const nb3 = (await sessions()).length;
  await A.click('#vm-btn-pause'); await sleep(300);
  u = await A.ui();
  T.check('T10 pausa sem sessao: volta a Parado + aviso (sem divergencia)', u.status === 'Parado' && !!(await A.toast()) && (await sessions()).length === nb3, JSON.stringify(u));

  // ============ heartbeat ============
  await A.go(url(ART));
  await A.click('#vm-btn-start'); a = await active(); const ls0 = a.lastSeenTs;
  await sleep(11500); a = await active();
  T.check('Heartbeat atualiza lastSeenTs (defasagem <= 10s)', a.lastSeenTs - ls0 > 0 && Date.now() - a.lastSeenTs < 10500, `+${((a.lastSeenTs - ls0) / 1000).toFixed(1)}s`);
  await A.click('#vm-btn-end'); await sleep(200);

  // ============ duas abas, mesmo artigo ============
  await A.go(url(ART));
  const B = await browser.openTab();
  await B.go(url(ART)); await sleep(500);
  await A.click('#vm-btn-start'); await sleep(900);
  let ub = await B.ui();
  T.check('2 abas: B acompanha inicio feito em A (evento storage)', ub.status === 'Estudando', JSON.stringify(ub));
  await B.click('#vm-btn-pause'); await sleep(900);
  let ua = await A.ui();
  T.check('2 abas: A acompanha pausa feita em B', ua.status === 'Pausado', JSON.stringify(ua));
  await A.click('#vm-btn-end'); await sleep(900);
  ub = await B.ui();
  T.check('2 abas: B percebe fim feito em A + aviso (sem divergencia)', ub.status === 'Parado' && !!(await B.toast()), JSON.stringify(ub));
  ss = await sessions(); s = ss[ss.length - 1];
  T.check('2 abas: 1 sessao gravada, com 1 pausa', s.pauses.length === 1 && s.state === 'done');
  await A.click('#vm-check'); await sleep(700);
  T.check('2 abas: "Concluido" de A aparece em B', await B.ev(`document.getElementById('vm-check').checked`) === true);
  await A.click('#vm-check'); await sleep(300);
  B.close();
  await fetch(`${browser.dbg}/json/close/${B.extra.id}`);

  // ============ localStorage indisponivel ============
  const inj = (await A.send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window,'localStorage',{get(){throw new Error('bloqueado')}});` })).result.identifier;
  await A.go(url(ART));
  T.check('Sem localStorage: pagina carrega sem erro', A.errors.length === 0, A.errors.join(' | '));
  await A.click('#vm-btn-start'); await sleep(2300);
  u = await A.ui();
  T.check('Sem localStorage: cronometro funciona (memoria)', u.status === 'Estudando' && secs(u.timer) >= 1, JSON.stringify(u));
  await A.click('#vm-btn-pause'); await sleep(400);
  T.check('Sem localStorage: pausa funciona', (await A.ui()).status === 'Pausado');
  await A.click('#vm-btn-end'); await sleep(300);
  T.check('Sem localStorage: fim funciona', (await A.ui()).status.startsWith('Conclu'));
  await A.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: inj });

  // ============ CSV + dashboard ============
  await A.go(url('index.html'), { wait: 1500 });
  const seed = [
    { id: 'a1', date: '2026-11-13', dayOfWeek: 'sexta-feira', subject: 'Lei "9.099", JECrim', subjectId: 'L9099', articleFile: 'L9099-ART-65', articleNum: 65, startTime: '09:00', endTime: '09:10', startTs: 1, pauses: [], pauseTotalMs: 12000, totalStudyMs: 9129, studyDuration: '00:00', pauseDuration: '00:00', state: 'done' },
    { id: 'a2', date: '2026-11-12', dayOfWeek: 'quinta-feira', subject: 'Cód. Penal', subjectId: 'CP', articleFile: 'DP-ART-28', articleNum: 28, startTime: '08:00', endTime: '09:00', startTs: 2, pauses: [], pauseTotalMs: 600000, totalStudyMs: 3000000, studyDuration: '00:50', pauseDuration: '00:10', state: 'done' },
    { id: 'a3', date: '2026-11-01', dayOfWeek: 'domingo', subject: 'Cód. Civil', subjectId: 'CC', articleFile: 'CC-ART-1', articleNum: 1, startTime: '08:00', endTime: '08:30', startTs: 3, pauses: [], pauseTotalMs: 0, studyDuration: '00:30', pauseDuration: '00:00', state: 'done' }
  ];
  await A.ev(`localStorage.setItem('vadeMecum_studySessions', ${JSON.stringify(JSON.stringify(seed))})`);
  const csv = await A.ev(`(async()=>{let blob;URL.createObjectURL=b=>{blob=b;return 'blob:x'};URL.revokeObjectURL=()=>{};HTMLAnchorElement.prototype.click=function(){};VMTracker.exportCSV();return await blob.text()})()`);
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  console.log('   CSV:\n   ' + lines.join('\n   '));
  T.check('CSV: 3 linhas de dados + cabecalho', lines.length === 4);
  T.check('CSV: duracao exata HH:MM:SS (9,1s nao vira 00:00)', lines[1].includes('"00:00:09"') && lines[1].includes('"00:00:12"') && lines[1].includes('"00:00:21"'), lines[1]);
  T.check('CSV: virgula e aspas no nome da materia nao quebram colunas', lines[1].includes('"Lei ""9.099"", JECrim"'));
  T.check('CSV: total = estudo + pausa (nao repete estudo)', lines[2].includes('"00:50:00","00:10:00","01:00:00"'), lines[2]);
  T.check('CSV: sessao antiga sem ms usa campos antigos', lines[3].includes('"00:30"'), lines[3]);
  const tbl = await A.ev(`(()=>{buildSessionsTable(VMTracker.getSessions());return [...document.querySelectorAll('#dbSessionsBody tr')].map(r=>[...r.children].slice(6,9).map(c=>c.textContent.trim()).join('|'))})()`);
  console.log('   tabela dashboard (estudo|pausas|total):', JSON.stringify(tbl));
  T.check('Dashboard: coluna Total difere de Estudo', JSON.stringify(tbl).includes('00:00:09|00:00:12|00:00:21') && JSON.stringify(tbl).includes('00:50:00|00:10:00|01:00:00'));
  await A.ev(`localStorage.clear()`);

  // ============ iframe (index-jecrim) ============
  await A.go(url('index-jecrim.html'), { wait: 1500 });
  await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;d.documentElement.style.scrollBehavior='auto';d.documentElement.scrollTop=2500;return 1})()`);
  await sleep(300);
  const fr = JSON.parse(await A.ev(`(()=>{const d=document.getElementById('painel_artigos').contentDocument;const b=d.getElementById('vm-study-bar').getBoundingClientRect();const n=d.getElementById('top-nav').getBoundingClientRect();return JSON.stringify({barTop:Math.round(b.top),navTop:Math.round(n.top),navBottom:Math.round(n.bottom)})})()`));
  T.check('iframe: barra e menu ficam visiveis apos rolar', fr.barTop === 0 && fr.navTop === 46 && fr.navBottom > 46, JSON.stringify(fr));
  await A.ev(`document.getElementById('painel_artigos').contentDocument.getElementById('vm-btn-start').click(),true`); await sleep(1600);
  T.check('iframe: cliques funcionam', secs(await A.ev(`document.getElementById('painel_artigos').contentDocument.getElementById('vm-timer').textContent`)) >= 1);
  await A.ev(`document.getElementById('painel_artigos').contentDocument.getElementById('vm-btn-end').click(),true`);


  T.done();
});
