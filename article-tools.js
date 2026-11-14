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

  // ───────────── 7. Barra de ferramentas ─────────────
  function mountDock() {
    if (document.querySelector('.vm-dock')) return;
    var d = document.createElement('div');
    d.className = 'vm-dock';
    d.setAttribute('role', 'toolbar');
    d.setAttribute('aria-label', 'Ferramentas do artigo');
    var html = '<button type="button" data-a="search" title="Buscar em todos os artigos (Ctrl+K)">Buscar</button>';
    if (prova) html += '<button type="button" data-a="hearing" aria-pressed="false" title="Mostrar só os pontos recorrentes desta página">Modo audiência</button>';
    html += '<button type="button" data-a="pdf" title="Imprimir ou salvar em PDF (a página inteira, ou só os pontos recorrentes no modo audiência)">PDF</button>';
    d.innerHTML = html;
    d.addEventListener('click', function(e) {
      var a = e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'search' && window.VMSearch) VMSearch.open();
      else if (a === 'hearing') setHearing(!hearingOn);
      else if (a === 'pdf') hearingOn && prova ? doPrint(prova, 'Pontos recorrentes') : doPrint(null, '');
    });
    document.body.appendChild(d);
  }

  // ───────────── inicialização ─────────────
  function init() {
    mountCopy();
    mountSectionPdf();
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.VMArticle = { setHearing: setHearing, print: doPrint };
})();
