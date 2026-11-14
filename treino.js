/**
 * Treino com cartões: os "pontos recorrentes" viram perguntas; revisão espaçada (Leitner) no study-tracker.js.
 * Dados: training.json (gerado por tools/build.py). Progresso: localStorage via VMTracker (entra no backup).
 */
(function() {
  'use strict';
  if (!window.VMTracker || !window.VMData) return;
  var T = VMTracker;
  var $ = function(id) { return document.getElementById(id); };
  var all = [], manifest = null, queue = [], pos = 0, revealed = false, session = null;

  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function articleLabel(f) { return manifest && manifest.articles[f] ? manifest.articles[f].label : f; }
  function openUrl(c) {
    var a = manifest && manifest.articles[c.file];
    var sub = a && manifest.subjects.filter(function(s) { return s.id === a.subject; })[0];
    var sec = (manifest && a && a.hearingId) || 'recorrentes';
    return sub ? sub.index + '?art=' + encodeURIComponent(c.file) + '&sec=' + encodeURIComponent(sec) : c.file + '#' + sec;
  }

  function selected() {
    var s = $('f-subj').value, f = $('f-art').value;
    return all.filter(function(c) { return (!s || c.subject === s) && (!f || c.file === f); });
  }

  function paintStats() {
    var c = selected(), ids = c.map(function(x) { return x.id; });
    var d = T.dueCount(ids);
    var emDia = ids.length - d.novos - d.vencidos;
    $('stats').innerHTML = '';
    [['Cartões', ids.length], ['Novos', d.novos], ['Para revisar', d.vencidos], ['Em dia', emDia]].forEach(function(p) {
      var el = document.createElement('div'); el.className = 'tr-stat';
      var b = document.createElement('b'); b.textContent = p[1];
      var s = document.createElement('span'); s.textContent = p[0];
      el.appendChild(b); el.appendChild(s); $('stats').appendChild(el);
    });
  }

  function fillArticles() {
    var s = $('f-subj').value, sel = $('f-art');
    var files = [];
    all.forEach(function(c) { if ((!s || c.subject === s) && files.indexOf(c.file) < 0) files.push(c.file); });
    sel.innerHTML = '<option value="">Todos</option>';
    files.forEach(function(f) { var o = document.createElement('option'); o.value = f; o.textContent = articleLabel(f); sel.appendChild(o); });
  }

  function buildQueue() {
    var mode = $('f-mode').value, limit = parseInt($('f-new').value, 10) || 20;
    var cards = T.getCards(), pool = selected();
    var due = pool.filter(function(c) { return T.cardState(cards[c.id]) === 'vencido'; })
      .sort(function(a, b) { return cards[a.id].due < cards[b.id].due ? -1 : 1; });
    var novos = pool.filter(function(c) { return T.cardState(cards[c.id]) === 'novo'; });
    if (mode === 'due') return due.concat(novos.slice(0, limit));
    if (mode === 'new') return novos.slice(0, limit);
    if (mode === 'random') return shuffle(pool.slice());
    return pool.slice();
  }

  function start(list) {
    queue = list || buildQueue();
    pos = 0; revealed = false;
    session = { errei: 0, dificil: 0, acertei: 0, total: queue.length, retry: [] };
    $('end').hidden = true;
    if (!queue.length) {
      $('area').hidden = true;
      var e = $('end'); e.hidden = false;
      e.innerHTML = '';
      var p = document.createElement('p');
      p.textContent = 'Nenhum cartão para este filtro agora. Se escolheu "Revisar hoje", não há cartão vencido: volte amanhã, ou use "Todos, em ordem" para treinar mesmo assim.';
      e.appendChild(p);
      return;
    }
    $('area').hidden = false;
    show();
  }

  function show() {
    var c = queue[pos];
    revealed = false;
    $('c-group').textContent = articleLabel(c.file) + (c.group ? ' · ' + c.group : '');
    var st = T.cardState(T.getCards()[c.id]);
    if (st !== 'em dia') { var b = document.createElement('span'); b.className = 'tr-state'; b.textContent = st; $('c-group').appendChild(b); }
    $('c-q').textContent = c.q;
    $('c-a').hidden = true;
    $('c-a-t').textContent = c.a;
    $('c-ref').textContent = c.ref ? 'Base: ' + c.ref : '';
    $('c-src').innerHTML = '';
    var a = document.createElement('a'); a.href = openUrl(c); a.textContent = 'Ver este ponto no artigo'; $('c-src').appendChild(a);
    $('act-reveal').hidden = false; $('act-rate').hidden = true;
    $('bar').style.width = (pos / queue.length * 100) + '%';
    $('b-reveal').focus();
  }

  function reveal() {
    if (revealed || !queue.length || $('area').hidden) return;
    revealed = true;
    $('c-a').hidden = false;
    $('act-reveal').hidden = true; $('act-rate').hidden = false;
    $('act-rate').querySelector('button').focus();
  }

  function rate(r) {
    if (!revealed) return;
    var c = queue[pos];
    T.rateCard(c.id, r);
    session[r]++;
    if (r === 'errei' && session.retry.indexOf(c.id) < 0) { session.retry.push(c.id); queue.push(c); }   // volta ao fim da fila, uma vez
    pos++;
    paintStats();
    if (pos >= queue.length) return finish();
    show();
  }

  function finish() {
    $('area').hidden = true;
    var e = $('end'); e.hidden = false; e.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = 'Sessão concluída'; h.style.marginTop = '0';
    var p = document.createElement('p');
    p.textContent = session.total + ' cartões: ' + session.acertei + ' acertos, ' + session.dificil + ' difíceis, ' + session.errei + ' erros.';
    var p2 = document.createElement('p'); p2.className = 'tp-src';
    p2.textContent = 'Os cartões que você errou voltam hoje; os acertados voltam em 1, 3, 7, 21 ou 60 dias, conforme a caixa.';
    e.appendChild(h); e.appendChild(p); e.appendChild(p2);
    var again = document.createElement('button'); again.className = 'tp-btn'; again.type = 'button'; again.textContent = 'Nova sessão';
    again.addEventListener('click', function() { start(); });
    e.appendChild(again); again.focus();
  }

  function init(training, m) {
    manifest = m;
    all = (training && training.cards) || [];
    if (!all.length) {
      $('stats').textContent = 'Os cartões só carregam quando o site é aberto pelo endereço publicado (não direto do arquivo no disco).';
      $('b-start').disabled = true;
      return;
    }
    if (m) m.subjects.forEach(function(s) {
      if (!all.some(function(c) { return c.subject === s.id; })) return;
      var o = document.createElement('option'); o.value = s.id; o.textContent = s.name; $('f-subj').appendChild(o);
    });
    fillArticles(); paintStats();
    $('f-subj').addEventListener('change', function() { fillArticles(); paintStats(); });
    $('f-art').addEventListener('change', paintStats);
    $('b-start').addEventListener('click', function() { start(); });
    $('b-reveal').addEventListener('click', reveal);
    $('act-rate').addEventListener('click', function(e) { var r = e.target.getAttribute && e.target.getAttribute('data-r'); if (r) rate(r); });
    document.addEventListener('keydown', function(e) {
      if ($('area').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = e.target.tagName;
      if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (!revealed && (e.key === ' ' || e.key === 'Enter') && e.target.tagName !== 'A') { e.preventDefault(); reveal(); }
      else if (revealed && e.key === '1') rate('errei');
      else if (revealed && e.key === '2') rate('dificil');
      else if (revealed && e.key === '3') rate('acertei');
    });
    // atalho vindo de fora: treino.html?art=ARQUIVO.html abre já filtrado
    var q = new URLSearchParams(location.search).get('art');
    if (q) {
      var c = all.filter(function(x) { return x.file === q; })[0];
      if (c) { $('f-subj').value = c.subject; fillArticles(); $('f-art').value = q; paintStats(); $('f-mode').value = 'all'; }
    }
  }

  Promise.all([VMData.training(), VMData.manifest()]).then(function(r) { init(r[0], r[1]); });
})();
