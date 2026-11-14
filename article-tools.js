/**
 * Ferramentas de cada artigo (carregado no fim de todas as páginas de artigo):
 *  1. Selo "Última conferência" com alerta de revisão (datas vêm de articles.json).
 *  2. Botões "anterior" e "próximo" (só entre artigos publicados da mesma matéria).
 *  3. "Continuar de onde parou": guarda a posição de leitura; a home e os índices oferecem retomar.
 *  4. Copiar trecho com a fonte (lei, quadros de jurisprudência e pontos recorrentes).
 *  5. Modo audiência: mostra só os "pontos recorrentes" da página.
 *  6. Imprimir / salvar em PDF a seção escolhida (usa a janela de impressão do navegador).
 *  7. Barra de ferramentas (Buscar, Modo audiência, PDF).
 * Estilos: study-bar.css (seção 4). Nada aqui altera o texto jurídico das páginas.
 */
(function() {
  'use strict';

  var bar = document.getElementById('vm-study-bar');
  var cfg = bar ? bar.dataset : {};
  var file = (window.VMData && VMData.currentFile()) || location.pathname.split('/').pop();
  var pageTitle = document.title.split(' | ')[0];
  var isPlaceholder = !!document.getElementById('em-elaboracao');
  var HEARING_KEY = 'vadeMecum_hearing';
  var freshInfo = null;                  // preenchido pelo selo de conferência; vai ao cabeçalho da impressão

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function clean(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  // ── aviso discreto ──
  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'vm-toast-tools';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toastEl.classList.remove('show'); }, 2600);
  }

  // ───────────── 1. Selo de conferência ─────────────
  function mountFreshness(m) {
    var a = m && m.articles && m.articles[file];
    if (!a || isPlaceholder) return;
    var hero = document.querySelector('#hero, header.hero, header');
    if (!hero || hero.querySelector('.vm-fresh')) return;
    var reviewDays = (window.VMTracker && VMTracker.getSettings) ? VMTracker.getSettings().reviewDays : 90;
    var f = VMData.freshness(a, reviewDays);
    freshInfo = f;
    var el = document.createElement('div');
    el.className = 'vm-fresh vm-fresh-' + f.cls;
    el.innerHTML = '<span class="vm-fresh-main"></span>' +
      (f.warn ? '<span class="vm-fresh-note">Antes de usar em peça ou audiência, confira de novo súmulas, teses e alterações legislativas.</span>' : '');
    el.querySelector('.vm-fresh-main').textContent = f.main;
    hero.appendChild(el);
  }

  // ───────────── 2. Anterior / próximo ─────────────
  function mountPrevNext(m) {
    if (!m || !cfg.subjectId || isPlaceholder || document.querySelector('.vm-pn')) return;
    var list = VMData.availableOf(m, cfg.subjectId);
    var i = list.indexOf(file);
    if (i < 0) return;
    var prev = i > 0 ? list[i - 1] : null, next = i < list.length - 1 ? list[i + 1] : null;
    if (!prev && !next) return;
    var nav = document.createElement('nav');
    nav.className = 'vm-pn';
    nav.setAttribute('aria-label', 'Navegação entre artigos');
    function link(f, cls, arrowBefore) {
      var a = document.createElement('a');
      a.className = cls; a.href = f;
      var span = document.createElement('span'); span.textContent = m.articles[f].label;
      if (arrowBefore) { a.appendChild(document.createTextNode('← ')); a.appendChild(span); }
      else { a.appendChild(span); a.appendChild(document.createTextNode(' →')); }
      a.setAttribute('aria-label', (arrowBefore ? 'Artigo anterior: ' : 'Próximo artigo: ') + m.articles[f].label);
      return a;
    }
    nav.appendChild(prev ? link(prev, 'vm-pn-prev', true) : document.createElement('span'));
    if (next) nav.appendChild(link(next, 'vm-pn-next', false));
    var footer = document.querySelector('footer');
    if (footer) footer.parentNode.insertBefore(nav, footer); else document.body.appendChild(nav);
  }

  // Marca o item do menu lateral do índice (quando o artigo está dentro do quadro).
  function syncParentMenu() {
    try {
      if (window.parent === window) return;
      [].forEach.call(window.parent.document.querySelectorAll('.menu-artigos a'), function(a) {
        a.classList.toggle('active', a.getAttribute('href') === file);
      });
    } catch (e) { /* fora do mesmo domínio: ignora */ }
  }

  // ───────────── 3. Continuar de onde parou ─────────────
  var sections = [].slice.call(document.querySelectorAll('section[id], .prova-section[id]'));
  var OFFSET = 160;                                 // altura aproximada de barra + menu
  var touched = false, saveTimer = null;

  function currentSection() {
    var best = null;
    sections.forEach(function(s) {
      var r = s.getBoundingClientRect();
      if (r.top <= OFFSET) best = { id: s.id, dy: Math.round(OFFSET - r.top) };
    });
    return best;
  }
  function saveProgress() {
    if (isPlaceholder || !window.VMTracker || !VMTracker.setLastRead) return;
    var h = document.documentElement;
    var max = h.scrollHeight - window.innerHeight;
    var y = window.scrollY || h.scrollTop || 0;
    if (!touched && y < 5) return;
    var cs = currentSection();
    VMTracker.setLastRead({
      file: file, title: pageTitle, subjectId: cfg.subjectId || '', subject: cfg.subject || '', articleNum: cfg.articleNum || '',
      pct: max > 0 ? Math.max(0, Math.min(100, Math.round(y / max * 100))) : 0,
      sec: cs ? cs.id : '', dy: cs ? cs.dy : 0, ts: Date.now()
    });
  }
  function onScroll() {
    touched = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProgress, 800);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden') saveProgress(); });

  function restoreProgress() {
    if (!/[?&]resume=1(?:&|$)/.test(location.search) || location.hash || !window.VMTracker) return;
    var lr = VMTracker.getLastRead();
    if (!lr || lr.file !== file) return;
    var el = lr.sec ? document.getElementById(lr.sec) : null;
    var top = el ? el.getBoundingClientRect().top + (window.scrollY || 0) - OFFSET + (lr.dy || 0)
                 : (lr.pct / 100) * (document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    touched = true;
    toast('Retomando de onde você parou (' + (lr.pct || 0) + '% da página).');
  }

  // ───────────── 4. Copiar com a fonte ─────────────
  function sourceLine(el) {
    var sec = el.closest ? el.closest('section[id]') : null;
    var url = location.origin + location.pathname + (sec && sec.id ? '#' + sec.id : '');
    var art = cfg.articleNum ? ', art. ' + cfg.articleNum : '';
    return '— Fonte: ' + (cfg.subject || 'Vade Mecum') + art + ' (' + pageTitle + '). Fluxograma: ' + url;
  }
  function plainText(el) {
    var c = el.cloneNode(true);
    [].forEach.call(c.querySelectorAll('.vm-copy, script, style'), function(n) { n.remove(); });
    return clean(c.textContent);
  }
  function copyText(el) {
    if (el.classList.contains('prova-item')) {
      var q = el.querySelector('.prova-item-q'), a = el.querySelector('.prova-item-a');
      if (q && a) {
        var qt = clean(q.textContent).replace(/^\d{1,3}\s*/, '');
        return 'P: ' + qt + '\nR: ' + clean(a.textContent) + '\n' + sourceLine(el);
      }
    }
    return plainText(el) + '\n' + sourceLine(el);
  }
  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function(resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('copy')); } catch (e) { reject(e); } finally { ta.remove(); }
    });
  }
  function mountCopy() {
    if (isPlaceholder) return;
    [].forEach.call(document.querySelectorAll('.law-quote, .law-box, .juris-card, .prova-item'), function(el) {
      if (el.querySelector(':scope > .vm-copy')) return;
      el.classList.add('vm-copyable');
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'vm-copy'; b.textContent = 'Copiar';
      b.setAttribute('aria-label', 'Copiar este trecho com a fonte');
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        writeClipboard(copyText(el)).then(function() {
          b.textContent = 'Copiado'; toast('Trecho copiado, com a fonte.');
          setTimeout(function() { b.textContent = 'Copiar'; }, 1600);
        }).catch(function() { toast('Não foi possível copiar neste navegador.'); });
      });
      el.appendChild(b);
    });
  }

  // ───────────── isolar uma parte da página (modo audiência e impressão) ─────────────
  function keep(c) {
    if (/^(SCRIPT|STYLE|LINK|META|TITLE|NOSCRIPT)$/.test(c.tagName)) return true;
    if (c.id && c.id.indexOf('vm-') === 0) return true;
    return typeof c.className === 'string' && /(^|\s)vm-/.test(c.className);
  }
  function clearAttr(attr) {
    [].forEach.call(document.querySelectorAll('[' + attr + ']'), function(e) { e.removeAttribute(attr); });
  }
  function isolate(target, attr) {
    clearAttr(attr);
    var n = target;
    while (n && n !== document.documentElement && n.parentElement) {
      [].forEach.call(n.parentElement.children, function(c) { if (c !== n && !keep(c)) c.setAttribute(attr, ''); });
      n = n.parentElement;
    }
  }

  // ───────────── 5. Modo audiência ─────────────
  var prova = isPlaceholder ? null : document.querySelector('.prova-section');
  var hearingOn = false;
  function setHearing(on, silent) {
    if (!prova) return;
    hearingOn = !!on;
    document.documentElement.classList.toggle('vm-hearing', hearingOn);
    if (hearingOn) isolate(prova, 'data-vm-hide-h'); else clearAttr('data-vm-hide-h');
    lsSet(HEARING_KEY, hearingOn ? '1' : '0');
    var btn = document.querySelector('.vm-dock [data-a=hearing]');
    if (btn) { btn.setAttribute('aria-pressed', hearingOn ? 'true' : 'false'); btn.textContent = hearingOn ? 'Sair do modo audiência' : 'Modo audiência'; }
    if (!silent) { window.scrollTo({ top: 0, behavior: 'instant' }); toast(hearingOn ? 'Modo audiência: só os pontos recorrentes.' : 'Página completa.'); }
  }
  function mountHearingTitle() {
    if (!prova || document.querySelector('.vm-hearing-title')) return;
    var t = document.createElement('div');
    t.className = 'vm-hearing-title';
    var out = document.createElement('button'); out.type = 'button'; out.textContent = 'Sair do modo audiência';
    out.addEventListener('click', function() { setHearing(false); });
    t.appendChild(out);
    var s = document.createElement('strong'); s.textContent = 'Modo audiência';
    t.appendChild(s);
    t.appendChild(document.createTextNode(' · ' + (cfg.subject || '') + (cfg.articleNum ? ', art. ' + cfg.articleNum : '') + ' · pontos recorrentes'));
    prova.parentNode.insertBefore(t, prova);
  }

  // Link para uma seção que o modo audiência esconde (ex.: resultado da busca na mesma página): sai do modo.
  function hashTargetHidden() {
    if (!location.hash || !prova) return false;
    var el = null;
    try { el = document.querySelector(location.hash.replace(/[^#\w-]/g, '')); } catch (e) { el = null; }
    return !!el && !prova.contains(el) && el !== prova;
  }
  window.addEventListener('hashchange', function() { if (hearingOn && hashTargetHidden()) setHearing(false, true); });

  // ───────────── 6. Imprimir / PDF por seção ─────────────
  var printHead = null;
  function buildPrintHead(sectionTitle) {
    if (!printHead) {
      printHead = document.createElement('div');
      printHead.className = 'vm-print-head';
      document.body.insertBefore(printHead, document.body.firstChild);
    }
    var d = new Date();
    var when = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    var fr = freshInfo && freshInfo.main ? ' · ' + freshInfo.main : '';
    printHead.innerHTML = '';
    var l1 = document.createElement('div'); l1.className = 'l1';
    l1.textContent = (cfg.subject || 'Vade Mecum') + (cfg.articleNum ? ', art. ' + cfg.articleNum : '') + ' — ' + pageTitle;
    var l2 = document.createElement('div'); l2.className = 'l2';
    l2.textContent = (sectionTitle ? 'Seção: ' + sectionTitle + ' · ' : '') + 'Impresso em ' + when + fr + ' · ' + location.origin + location.pathname;
    printHead.appendChild(l1); printHead.appendChild(l2);
  }
  function cleanupPrint() {
    clearAttr('data-vm-hide-p');
    document.documentElement.classList.remove('vm-printing');
  }
  function doPrint(section, title) {
    buildPrintHead(title);
    if (section) isolate(section, 'data-vm-hide-p'); else clearAttr('data-vm-hide-p');
    document.documentElement.classList.add('vm-printing');
    setTimeout(function() { window.print(); }, 60);
  }
  window.addEventListener('afterprint', cleanupPrint);

  function mountSectionPdf() {
    if (isPlaceholder) return;
    sections.forEach(function(sec) {
      var head = sec.querySelector('.section-header') || (sec.classList.contains('prova-section') ? sec.querySelector('h2') : null);
      if (!head || head.querySelector('.vm-sec-pdf')) return;
      var tEl = sec.querySelector('.section-title') || sec.querySelector('h2');
      var title = tEl ? clean(tEl.textContent) : sec.id;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'vm-sec-pdf'; b.textContent = 'PDF';
      b.title = 'Imprimir ou salvar esta seção em PDF (na janela, escolha "Salvar como PDF")';
      b.setAttribute('aria-label', 'Imprimir ou salvar em PDF a seção ' + title);
      b.addEventListener('click', function() { doPrint(sec, title); });
      head.appendChild(b);
    });
  }

  // ───────────── 8. Citações de súmulas e teses (registro único) ─────────────
  // O texto das páginas NÃO muda: o navegador reconhece citações (padrões em registry/patterns.json), sublinha-as
  // e mostra o status e o enunciado do registro central (registry/precedentes.json → citations.json).
  var citeData = null, pop = null, popTimer = null;
  var CITE_SKIP = 'a,button,script,style,textarea,select,input,.vm-cite,.vm-copy,.vm-sec-pdf,.vm-dock,.vm-skip,#vm-study-bar,#top-nav,nav,.vm-note-box,.vm-toast-tools,.vm-print-head,.vm-fresh,.vm-pn';
  var STATUS_TXT = { vigente: 'Vigente', cancelada: 'CANCELADA', superada: 'Superada', alterada: 'Alterada' };

  function citeId(x, m) {
    var trib = x.tribunal || String(m[x.tribunalGroup]).toUpperCase();
    return trib + '-' + x.tipo + '-' + parseInt(m[1], 10);
  }

  function wrapTextNode(node, pats) {
    var text = node.nodeValue, hits = [];
    pats.forEach(function(c) {
      c.rx.lastIndex = 0;
      var m;
      while ((m = c.rx.exec(text))) {
        var id = citeId(c.p, m);
        if (citeData[id]) hits.push({ s: m.index, e: m.index + m[0].length, id: id });
        if (m[0].length === 0) c.rx.lastIndex++;
      }
    });
    if (!hits.length) return;
    hits.sort(function(a, b) { return a.s - b.s || b.e - a.e; });
    var frag = document.createDocumentFragment(), pos = 0;
    hits.forEach(function(h) {
      if (h.s < pos) return;                               // sobreposição: fica a primeira
      if (h.s > pos) frag.appendChild(document.createTextNode(text.slice(pos, h.s)));
      var st = citeData[h.id].status;
      var span = document.createElement('span');
      span.className = 'vm-cite vm-cite-' + st;
      span.tabIndex = 0;
      span.setAttribute('data-cite', h.id);
      span.textContent = text.slice(h.s, h.e);
      frag.appendChild(span);
      if (st === 'cancelada' || st === 'superada' || st === 'alterada') {
        var f = document.createElement('sup');
        f.className = 'vm-cite-flag';
        f.textContent = STATUS_TXT[st].toLowerCase();
        frag.appendChild(f);
      }
      pos = h.e;
    });
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
  }

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.id = 'vm-cite-pop';
    pop.setAttribute('role', 'tooltip');
    pop.hidden = true;
    pop.addEventListener('mouseenter', function() { clearTimeout(popTimer); });
    pop.addEventListener('mouseleave', hidePop);
    document.body.appendChild(pop);
    return pop;
  }
  function hidePop() { clearTimeout(popTimer); popTimer = setTimeout(function() { if (pop) pop.hidden = true; }, 180); }
  function showPop(el) {
    clearTimeout(popTimer);
    var id = el.getAttribute('data-cite'), e = citeData && citeData[id];
    if (!e) return;
    var p = ensurePop();
    p.innerHTML = '';
    function line(cls, txt) { var d = document.createElement('div'); d.className = cls; d.textContent = txt; p.appendChild(d); return d; }
    line('vcp-t', e.label);
    var st = e.status === 'nao-verificado'
      ? 'Enunciado ainda não cadastrado no registro. Confira o texto na fonte oficial.'
      : (STATUS_TXT[e.status] || e.status) + (e.verificadoEm ? ' · verificado em ' + e.verificadoEm.split('-').reverse().join('/') : '');
    line('vcp-s vcp-' + e.status, st);
    if (e.enunciado) line('vcp-e', e.enunciado);
    if (e.observacao) line('vcp-o', e.observacao);
    var row = document.createElement('div'); row.className = 'vcp-l';
    if (e.fonte) { var a = document.createElement('a'); a.href = e.fonte; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Fonte oficial'; row.appendChild(a); }
    var b = document.createElement('a'); b.href = 'sumulas.html#' + id; b.target = '_top'; b.textContent = 'Onde aparece neste site (' + e.mentions.length + ')'; row.appendChild(b);
    p.appendChild(row);
    p.hidden = false;
    var r = el.getBoundingClientRect(), w = Math.min(360, window.innerWidth - 16);
    p.style.maxWidth = w + 'px';
    p.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    var below = r.bottom + 6, h = p.offsetHeight;
    p.style.top = (below + h > window.innerHeight && r.top - h - 6 > 0 ? r.top - h - 6 : below) + 'px';
  }

  function mountCitations() {
    if (isPlaceholder || !window.VMData) return;
    Promise.all([VMData.citations(), VMData.patterns()]).then(function(r) {
      if (!r[0] || !r[1]) return;
      citeData = r[0].entries;
      var pats = r[1].patterns.map(function(x) { return { p: x, rx: new RegExp(x.regex, 'gi') }; });
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function(n) {
          if (!n.nodeValue || n.nodeValue.length < 4) return NodeFilter.FILTER_REJECT;
          var el = n.parentElement;
          if (!el || el.closest(CITE_SKIP)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function(node) { wrapTextNode(node, pats); });
    });
    document.addEventListener('mouseover', function(e) {
      var t = e.target.closest && e.target.closest('.vm-cite');
      if (t) showPop(t);
      else if (!(e.target.closest && e.target.closest('#vm-cite-pop'))) hidePop();
    });
    document.addEventListener('focusin', function(e) { var t = e.target.closest && e.target.closest('.vm-cite'); if (t) showPop(t); });
    document.addEventListener('focusout', function(e) { if (e.target.closest && e.target.closest('.vm-cite')) hidePop(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && pop) pop.hidden = true; });
  }

  // ───────────── 9. Marcadores e notas por seção ─────────────
  function secTools(head) {
    var w = head.querySelector('.vm-sec-tools');
    if (!w) {
      w = document.createElement('span');
      w.className = 'vm-sec-tools';
      var pdf = head.querySelector('.vm-sec-pdf');
      head.appendChild(w);
      if (pdf) w.appendChild(pdf);
    }
    return w;
  }

  function mountNotesMarks() {
    if (isPlaceholder || !window.VMTracker || !VMTracker.setNote) return;
    sections.forEach(function(sec) {
      var head = sec.querySelector('.section-header') || (sec.classList.contains('prova-section') ? sec.querySelector('h2') : null);
      if (!head || head.querySelector('.vm-mark')) return;
      var key = file + '#' + sec.id;
      var tEl = sec.querySelector('.section-title') || sec.querySelector('h2');
      var title = tEl ? clean(tEl.textContent) : sec.id;
      var tools = secTools(head);

      var mark = document.createElement('button');
      mark.type = 'button'; mark.className = 'vm-mark';
      function paintMark() {
        var on = !!VMTracker.getMarks()[key];
        mark.textContent = on ? 'Marcado' : 'Marcar';
        mark.setAttribute('aria-pressed', on ? 'true' : 'false');
        mark.setAttribute('aria-label', (on ? 'Remover marcador da seção ' : 'Marcar a seção ') + title);
      }
      mark.addEventListener('click', function() { var on = VMTracker.toggleMark(key); paintMark(); toast(on ? 'Seção marcada. Veja na home, em "Marcadores e notas".' : 'Marcador removido.'); });
      paintMark();

      var nb = document.createElement('button');
      nb.type = 'button'; nb.className = 'vm-note-btn';
      var box = document.createElement('div');
      box.className = 'vm-note-box';
      head.insertAdjacentElement('afterend', box);

      function paintBtn() {
        var has = !!VMTracker.getNotes()[key];
        nb.textContent = has ? 'Nota (1)' : 'Nota';
        nb.setAttribute('aria-label', (has ? 'Ver ou editar a nota da seção ' : 'Escrever uma nota na seção ') + title);
      }
      function renderBox(editing) {
        var saved = VMTracker.getNotes()[key];
        box.innerHTML = '';
        if (!saved && !editing) { box.hidden = true; paintBtn(); return; }
        box.hidden = false;
        if (editing) {
          var ta = document.createElement('textarea');
          ta.maxLength = 2000; ta.rows = 4; ta.value = saved ? saved.text : '';
          ta.setAttribute('aria-label', 'Nota da seção ' + title);
          ta.placeholder = 'Sua anotação sobre esta seção (fica só neste navegador e entra no backup).';
          var row = document.createElement('div'); row.className = 'vm-note-act';
          function b(label, fn) { var x = document.createElement('button'); x.type = 'button'; x.textContent = label; x.addEventListener('click', fn); row.appendChild(x); }
          b('Salvar', function() { VMTracker.setNote(key, ta.value); renderBox(false); toast('Nota salva.'); });
          if (saved) b('Apagar', function() { VMTracker.setNote(key, ''); renderBox(false); toast('Nota apagada.'); });
          b('Cancelar', function() { renderBox(false); });
          ta.addEventListener('keydown', function(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); VMTracker.setNote(key, ta.value); renderBox(false); toast('Nota salva.'); } });
          box.appendChild(ta); box.appendChild(row);
          ta.focus();
        } else {
          var s = document.createElement('strong'); s.textContent = 'Sua nota';
          var p = document.createElement('p'); p.textContent = saved.text;
          var e = document.createElement('button'); e.type = 'button'; e.textContent = 'Editar'; e.addEventListener('click', function() { renderBox(true); });
          box.appendChild(s); box.appendChild(p); box.appendChild(e);
        }
        paintBtn();
      }
      nb.addEventListener('click', function() {
        if (!box.hidden && box.querySelector('textarea')) { renderBox(false); return; }
        renderBox(true);
      });
      renderBox(false);
      tools.insertBefore(nb, tools.firstChild);
      tools.insertBefore(mark, tools.firstChild);
    });
  }

  // ───────────── 10. Tamanho da letra e modo escuro ─────────────
  var UI_KEY = 'vadeMecum_ui';
  var FONT_STEPS = [90, 100, 115, 130, 150];
  function uiGet() { try { return JSON.parse(lsGet(UI_KEY)) || {}; } catch (e) { return {}; } }
  function uiSet(p) { var u = uiGet(); for (var k in p) u[k] = p[k]; lsSet(UI_KEY, JSON.stringify(u)); return u; }
  function applyUi() {
    var u = uiGet(), h = document.documentElement, f = u.fs || 100;
    h.classList.toggle('vm-dark', !!u.dark);
    h.classList.toggle('vm-zoom', f !== 100);
    h.style.setProperty('--vm-zoom', String(f / 100));
    var fb = document.querySelector('.vm-dock [data-a=font]'), db = document.querySelector('.vm-dock [data-a=theme]');
    if (fb) fb.textContent = 'Letra ' + f + '%';
    if (db) { db.setAttribute('aria-pressed', u.dark ? 'true' : 'false'); db.textContent = u.dark ? 'Tema claro' : 'Tema escuro'; }
  }
  function cycleFont() {
    var f = uiGet().fs || 100, i = FONT_STEPS.indexOf(f);
    var next = FONT_STEPS[(i + 1) % FONT_STEPS.length];
    uiSet({ fs: next }); applyUi(); toast('Tamanho da letra: ' + next + '%');
  }
  function toggleDark() { var on = !uiGet().dark; uiSet({ dark: on }); applyUi(); toast(on ? 'Tema escuro (experimental).' : 'Tema claro.'); }

  // ───────────── 7. Barra de ferramentas ─────────────
  function mountDock() {
    if (document.querySelector('.vm-dock')) return;
    var d = document.createElement('div');
    d.className = 'vm-dock';
    d.id = 'vm-dock';
    d.setAttribute('role', 'group');
    d.setAttribute('aria-label', 'Ferramentas do artigo');
    var html = '<button type="button" data-a="search" title="Buscar em todos os artigos">Buscar nos artigos <kbd>Ctrl K</kbd></button>';
    if (prova) html += '<button type="button" data-a="hearing" aria-pressed="false" title="Mostrar só os pontos recorrentes desta página">Modo audiência</button>';
    html += '<button type="button" data-a="font" title="Aumentar ou diminuir a letra do texto">Letra 100%</button>';
    html += '<button type="button" data-a="theme" aria-pressed="false" title="Alternar entre tema claro e escuro (experimental)">Tema escuro</button>';
    html += '<button type="button" data-a="pdf" title="Imprimir ou salvar em PDF (a página inteira, ou só os pontos recorrentes no modo audiência)">Imprimir / PDF</button>';
    html += '<button type="button" data-a="top">Voltar ao topo</button>';
    d.innerHTML = html;

    // Um único botão discreto na barra superior abre o menu; nada flutua sobre o texto.
    var tg = document.createElement('button');
    tg.type = 'button';
    tg.className = 'vm-tools-btn';
    tg.setAttribute('aria-haspopup', 'true');
    tg.setAttribute('aria-expanded', 'false');
    tg.setAttribute('aria-controls', 'vm-dock');
    tg.innerHTML = '<span class="vt-long">Ferramentas ▾</span><span class="vt-short">Mais ▾</span>';
    var anchor = bar && bar.querySelector('.vm-completed-wrap');
    if (bar && anchor) anchor.parentNode.insertBefore(tg, anchor);
    else if (bar) bar.appendChild(tg);
    else document.body.appendChild(tg);

    function setOpen(on) {
      d.classList.toggle('open', on);
      tg.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) { var f = d.querySelector('button'); if (f) f.focus(); }
    }
    tg.addEventListener('click', function(e) { e.stopPropagation(); setOpen(!d.classList.contains('open')); });
    d.addEventListener('click', function(e) {
      var b = e.target.closest && e.target.closest('button');
      var a = b && b.getAttribute('data-a');
      if (!a) return;
      if (a === 'search' && window.VMSearch) VMSearch.open();
      else if (a === 'hearing') setHearing(!hearingOn);
      else if (a === 'font') cycleFont();
      else if (a === 'theme') toggleDark();
      else if (a === 'pdf') hearingOn && prova ? doPrint(prova, 'Pontos recorrentes') : doPrint(null, '');
      else if (a === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      if (a !== 'font' && a !== 'theme') setOpen(false);                      // letra e tema deixam o menu aberto para ajustar de novo
    });
    document.addEventListener('click', function(e) { if (d.classList.contains('open') && !d.contains(e.target) && e.target !== tg) setOpen(false); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && d.classList.contains('open')) { setOpen(false); tg.focus(); } });
    document.body.appendChild(d);
    applyUi();
  }

  // ───────────── inicialização ─────────────
  function init() {
    mountCopy();
    mountSectionPdf();
    mountNotesMarks();
    mountHearingTitle();
    mountDock();
    syncParentMenu();
    if (prova) {
      if (lsGet(HEARING_KEY) === '1' && !hashTargetHidden()) setHearing(true, true);
    }
    window.addEventListener('load', restoreProgress);
    if (window.VMData) {
      VMData.manifest().then(function(m) { mountFreshness(m); mountPrevNext(m); });
    }
    mountCitations();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.VMArticle = { setHearing: setHearing, print: doPrint };
})();
