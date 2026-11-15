/** Tela das calculadoras. A lógica está em calc-core.js (testada); aqui só entrada, saída e as fontes oficiais. */
(function() {
  'use strict';
  var C = window.VMCalc;
  var $ = function(id) { return document.getElementById(id); };
  var laws = { CP: null, L9099: null, CPP: null }, citations = null;
  var LAW_NAMES = { CP: 'Código Penal', L9099: 'Lei 9.099/1995', CPP: 'Código de Processo Penal' };

  function pena(prefix) { return { anos: +$(prefix + '-a').value || 0, meses: +$(prefix + '-m').value || 0, dias: +$(prefix + '-d').value || 0 }; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /** Mostra a conclusão e a lista de passos/avisos num contêiner. */
  function show(box, title, big, kind, lines, warns) {
    box.innerHTML = '';
    var cls = kind === 'ok' ? 'tp-ok' : kind === 'no' ? 'tp-warn' : 'tp-note';
    var wrap = el('div', cls);
    wrap.appendChild(el('h4', '', title));
    if (big) wrap.appendChild(el('div', 'cl-big', big));
    if (lines && lines.length) { var ul = el('ul'); lines.forEach(function(l) { ul.appendChild(el('li', '', l)); }); wrap.appendChild(ul); }
    box.appendChild(wrap);
    if (warns && warns.length) { var w = el('div', 'tp-note'); warns.forEach(function(x) { w.appendChild(el('p', '', x)); w.lastChild.style.margin = '.2rem 0'; }); box.appendChild(w); }
  }
  function error(box, e) { box.innerHTML = ''; box.appendChild(el('div', 'tp-warn', e.message || String(e))); }

  /** Texto oficial de artigos do retrato (data/laws/*.json), em <details>. */
  function sources(boxId, lawId, nums, extra) {
    var box = $(boxId); if (!box) return; box.innerHTML = '';
    var snap = laws[lawId];
    if (!snap) { box.appendChild(el('p', 'tp-src', 'O texto oficial dos dispositivos só carrega quando o site é aberto pelo endereço publicado.')); return; }
    nums.forEach(function(n) {
      var a = snap.articles[n];
      if (!a) return;
      var d = el('details', 'tp-law'); d.appendChild(el('summary', '', LAW_NAMES[lawId] + ', art. ' + n));
      d.appendChild(el('blockquote', '', a.text));
      d.appendChild(el('div', 'tp-src', 'Planalto (texto compilado), lido em ' + snap.lidoEm.split('-').reverse().join('/') + '. '));
      d.lastChild.appendChild(Object.assign(el('a', '', 'Abrir no Planalto'), { href: snap.url, target: '_blank', rel: 'noopener' }));
      box.appendChild(d);
    });
    if (extra) box.appendChild(extra);
  }
  function sumulaBlock(id) {
    var e = citations && citations.entries[id];
    if (!e || !e.enunciado) return null;
    var d = el('details', 'tp-law'); d.appendChild(el('summary', '', e.label + ' (STF)'));
    d.appendChild(el('blockquote', '', e.enunciado));
    var s = el('div', 'tp-src', 'Página oficial do STF, lida em ' + e.verificadoEm.split('-').reverse().join('/') + '. ');
    s.appendChild(Object.assign(el('a', '', 'Abrir no STF'), { href: e.fonte, target: '_blank', rel: 'noopener' }));
    d.appendChild(s);
    return d;
  }

  // ── 1. prescrição ──
  var EV_TYPES = ['Recebimento da denúncia ou queixa (I)', 'Pronúncia (II)', 'Decisão confirmatória da pronúncia (III)', 'Publicação da sentença ou acórdão condenatórios recorríveis (IV)'];
  function addEvent(type, date) {
    var row = el('div', 'cl-ev');
    var lab = el('label', 'tp-field', 'Marco'); var sel = el('select'); EV_TYPES.forEach(function(t, i) { var o = el('option', '', t); o.value = String(i); sel.appendChild(o); });
    if (type != null) sel.value = String(type);
    lab.appendChild(sel);
    var lab2 = el('label', 'tp-field', 'Data'); var inp = el('input'); inp.type = 'date'; if (date) inp.value = date; lab2.appendChild(inp);
    var rm = el('button', 'tp-btn ghost', 'Remover'); rm.type = 'button'; rm.addEventListener('click', function() { row.remove(); });
    row.appendChild(lab); row.appendChild(lab2); row.appendChild(rm);
    $('p-evs').appendChild(row);
    return row;
  }
  function calcPresc(ev) {
    ev.preventDefault();
    var box = $('p-res');
    try {
      var modo = $('p-modo').value;
      var r = C.prazoPrescricao({ modo: modo, pena: pena('p'), menor21: $('p-m21').checked, maior70: $('p-m70').checked,
        violenciaSexualMulher: $('p-vs').checked, reincidente: $('p-rei').checked });
      var lines = r.passos.slice();
      var avisos = r.avisos.slice();
      var ini = $('p-ini').value, ref = $('p-ref').value || today();
      var big = 'Prazo prescricional: ' + r.texto;
      var kind = 'info';
      if (ini) {
        var u = C.ultimoDia(ini, r.meses);
        lines.push('Sem nenhum marco interruptivo, o prazo contado do termo inicial (' + C.br(ini) + ') termina em ' + C.br(u.data) + ' (art. 10: o dia do começo inclui-se).');
        if (u.ajustado) avisos.push('O dia do termo inicial não existe no mês final: o "aniversário" recuou para o último dia do mês. Confira manualmente o último dia do prazo.');
        var evs = [].map.call($('p-evs').children, function(row) {
          var sel = row.querySelector('select'), d = row.querySelector('input').value;
          return d ? { rotulo: EV_TYPES[+sel.value].replace(/ \([IV]+\)$/, ''), data: d } : null;
        }).filter(Boolean);
        var c = C.conferirIntervalos(ini, evs, ref, r.meses);
        lines.push('Conferência de ' + c.intervalos.length + ' intervalo(s) até ' + C.br(ref) + ':');
        c.intervalos.forEach(function(i) {
          lines.push('   ' + i.de + ' (' + C.br(i.dataDe) + ') até ' + i.ate + ' (' + C.br(i.dataAte) + '): o prazo terminaria em ' + C.br(i.ultimoDia) + (i.prescreveu ? '. PRESCREVEU neste intervalo.' : '. Não prescreveu.'));
        });
        if (c.prescreveu) { big += ' · prescrição em ' + C.br(c.quando); kind = 'no'; }
        else { big += ' · sem prescrição nos intervalos informados'; kind = 'ok'; }
      } else {
        avisos.push('Informe o termo inicial para calcular as datas.');
      }
      show(box, 'Resultado', big, kind, lines, avisos);
    } catch (e) { error(box, e); }
  }

  // ── 2. SCPP ──
  function calcScpp(ev) {
    ev.preventDefault();
    var box = $('s-res');
    try {
      var r = C.scpp({ minima: pena('s'), continuado: $('s-cont').checked });
      var lines = r.razoes.slice(), avisos = ['Além da pena mínima, o art. 89 exige que o acusado não esteja sendo processado nem tenha sido condenado por outro crime e que estejam presentes os demais requisitos da suspensão condicional da pena (CP, art. 77). Isso depende dos fatos e não é calculado aqui.'];
      var ini = $('s-ini').value;
      if (r.admissivel && ini) {
        var p = C.periodoProva(ini, +$('s-anos').value, [2, 4]);
        lines.push('Período de prova de ' + $('s-anos').value + ' anos a partir de ' + C.br(ini) + ': termina em ' + C.br(p.fim) + ' (art. 89, § 5º: expirado o prazo sem revogação, declara-se extinta a punibilidade).');
        lines.push('Art. 89, § 6º: não corre a prescrição durante o prazo de suspensão do processo.');
        if (p.ajustado) avisos.push('O dia de início não existe no mês final: confira manualmente o último dia do período.');
      }
      show(box, r.admissivel ? 'Pena mínima compatível com a suspensão' : 'Pena mínima acima do limite', null, r.admissivel ? 'ok' : 'no', lines, avisos);
    } catch (e) { error(box, e); }
  }

  // ── 3. sursis ──
  function calcSursis(ev) {
    ev.preventDefault();
    var box = $('u-res');
    try {
      var r = C.sursis({ pena: pena('u'), maior70OuSaude: $('u-70').checked, reincidenteDoloso: $('u-rei').checked });
      var lines = r.razoes.slice(), avisos = ['Os demais requisitos (art. 77, II: culpabilidade, antecedentes, conduta social, personalidade, motivos e circunstâncias; III: substituição do art. 44 não indicada ou não cabível) dependem do caso e não são calculados aqui.'];
      var ini = $('u-ini').value;
      if (r.cabe && ini) {
        var anos = +$('u-anos').value;
        var p = C.periodoProva(ini, anos, r.faixa);
        lines.push('Período de ' + anos + ' anos a partir de ' + C.br(ini) + ': termina em ' + C.br(p.fim) + '.');
      }
      show(box, r.cabe ? 'Cabe pelos critérios de pena, idade/saúde e reincidência' : 'Não cabe por estes critérios', r.faixa ? 'Período: ' + r.faixa[0] + ' a ' + r.faixa[1] + ' anos' : null, r.cabe ? 'ok' : 'no', lines, avisos);
    } catch (e) { error(box, e); }
  }

  // ── 4. menor potencial ──
  function calcMenor(ev) {
    ev.preventDefault();
    var box = $('o-res');
    try {
      var r = C.menorPotencial({ maxima: pena('o'), contravencao: $('o-c').checked });
      show(box, r.sim ? 'É infração de menor potencial ofensivo' : 'Não é infração de menor potencial ofensivo', null, r.sim ? 'ok' : 'no', [r.razao], []);
    } catch (e) { error(box, e); }
  }

  function loadSources() {
    var st = $('fonte-status');
    var get = function(f) { return fetch(f).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }); };
    Promise.all([get('data/laws/CP.json'), get('data/laws/L9099.json'), window.VMData ? VMData.citations() : null, get('data/laws/CPP.json')]).then(function(r) {
      laws.CP = r[0]; laws.L9099 = r[1]; citations = r[2]; laws.CPP = r[3];
      if (!laws.CP || !laws.L9099 || !laws.CPP) st.textContent = 'Não foi possível carregar o texto oficial dos dispositivos (abra pelo endereço publicado do site).';
      else st.textContent = 'Texto oficial dos dispositivos: Planalto, lido em ' + laws.CP.lidoEm.split('-').reverse().join('/') + '.';
      sources('p-src', 'CP', ['10', '109', '110', '111', '115', '116', '117', '119']);
      sources('s-src', 'L9099', ['89'], sumulaBlock('STF-S-723'));
      sources('u-src', 'CP', ['77']);
      sources('o-src', 'L9099', ['61']);
      sources('t-src', 'L9099', ['76'], sumulaBlock('STF-SV-35'));
      sources('z-src', 'L9099', ['78', '82', '83', '92', '12-A']);
      if (laws.CPP) { var z2 = el('div'); z2.id = 'z-src2'; $('z-src').appendChild(z2); sources('z-src2', 'CPP', ['798']); }
      sources('d-src', 'CP', ['10', '103']);
      if (laws.CPP) { var d2 = el('div'); d2.id = 'd-src2'; $('d-src').appendChild(d2); sources('d-src2', 'CPP', ['38']); }
    });
  }

  // ── 5. transação penal (art. 76) ──
  var MARCA = { ok: 'Atende', impede: 'Impede', verificar: 'A verificar' };
  function calcTrans(ev) {
    ev.preventDefault();
    var box = $('t-res');
    try {
      var ref = $('t-ref').value || today();
      var r = C.transacao({ acao: $('t-acao').value, arquivamento: $('t-arq').checked, condenadoPpl: $('t-ppl').checked,
        beneficioAnterior: $('t-ben').value, dataBeneficio: $('t-bdata').value, ref: ref, circunstancias: $('t-circ').value, menorPotencial: $('t-menor').checked });
      var lines = r.itens.map(function(i) { return MARCA[i.ok] + ' · ' + i.ref + ': ' + i.texto; });
      var tit = r.conclusao === 'impede' ? 'Há impedimento legal para a proposta' : r.conclusao === 'verificar' ? 'Nenhum impedimento nos itens informados, mas há pontos a verificar' : 'Nenhum impedimento nos itens enumerados no art. 76';
      show(box, tit, null, r.conclusao === 'impede' ? 'no' : r.conclusao === 'ok' ? 'ok' : 'info', lines.concat(r.notas),
        ['Ferramenta de apoio: o juízo sobre a proposta cabe ao Ministério Público e ao juiz. Esta lista segue o texto do art. 76 e não substitui a análise da jurisprudência atual.']);
    } catch (e) { error(box, e); }
  }

  // ── 6. prazos do procedimento ──
  function calcPrazo(ev) {
    ev.preventDefault();
    var box = $('z-res');
    try {
      var tipo = $('z-tipo').value.split('|');
      var fer = $('z-fer').value.split(/[\s,;]+/).filter(Boolean);
      var r = C.prazoProcessual({ inicio: $('z-ini').value, dias: +tipo[0], modo: $('z-modo').value, feriados: fer });
      show(box, tipo[1], 'Último dia: ' + C.br(r.fim) + ' (' + r.diaSemana + ')', 'ok', r.passos, r.avisos);
    } catch (e) { error(box, e); }
  }
  function calcTest(ev) {
    ev.preventDefault();
    var box = $('w-res');
    try {
      var r = C.antesDe($('w-aud').value, 5);
      show(box, 'Testemunhas e requerimento de intimação (art. 78, § 1º)', 'Até ' + C.br(r.limite) + ' (' + r.diaSemana + ')', 'ok',
        ['A lei diz "no mínimo cinco dias antes" da audiência: subtraídos cinco dias da data informada (' + C.br($('w-aud').value) + ').'],
        ['Confira como o juízo conta o dia da audiência e o do ato, e se o último dia cai em dia sem expediente.']);
    } catch (e) { error(box, e); }
  }

  // ── 7. decadência ──
  function calcDec(ev) {
    ev.preventDefault();
    var box = $('d-res');
    try {
      var r = C.decadencia({ ciencia: $('d-ini').value, violenciaDomestica: $('d-vd').checked });
      show(box, 'Prazo de ' + r.meses + ' meses', 'Último dia: ' + C.br(r.fim), 'ok', r.passos, r.avisos);
    } catch (e) { error(box, e); }
  }

  $('p-ref').value = today();
  $('t-ref').value = today();
  $('f-trans').addEventListener('submit', calcTrans);
  $('f-prazos').addEventListener('submit', calcPrazo);
  $('f-test').addEventListener('submit', calcTest);
  $('f-dec').addEventListener('submit', calcDec);
  addEvent(0, '');
  $('p-addev').addEventListener('click', function() { addEvent(0, ''); });
  $('f-presc').addEventListener('submit', calcPresc);
  $('f-scpp').addEventListener('submit', calcScpp);
  $('f-sursis').addEventListener('submit', calcSursis);
  $('f-menor').addEventListener('submit', calcMenor);
  loadSources();
})();
