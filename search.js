/**
 * Busca global (Ctrl+K ou "/"): por artigo, tema ou tese, em todos os artigos publicados.
 * Índice de texto integral gerado por tools/build.py (search-index.json), carregado só na 1ª abertura.
 *
 * Teclado: Ctrl+K ou "/" abre · ↑ ↓ navegam · Enter abre · Esc fecha.
 * Onde abre o resultado:
 *   - nas páginas de índice (menu lateral): dentro do quadro do artigo;
 *   - na home: no visualizador da matéria (index-xxx.html?art=...), com menu e cronômetro;
 *   - dentro de um artigo: na própria página.
 */
(function(window) {
  'use strict';

  var MAX_RESULTS = 40;
  var state = { open: false, idx: null, norm: null, sel: -1, results: [] };
  var el = {};
  var lastFocus = null;

  function fold(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var CSS = '' +
    '#vm-search{position:fixed;inset:0;z-index:2147483647;display:none;background:rgba(7,14,22,.62);align-items:flex-start;justify-content:center;padding:8vh 12px 12px;}' +
    '#vm-search.open{display:flex;}' +
    '#vm-search .vs-box{width:min(760px,100%);max-height:84vh;display:flex;flex-direction:column;background:#faf7f2;color:#1a1208;border:2px solid #c8960c;border-radius:8px;box-shadow:0 18px 60px rgba(0,0,0,.55);overflow:hidden;font-family:"Source Serif 4",Georgia,serif;}' +
    '#vm-search .vs-head{display:flex;gap:.5rem;align-items:center;padding:.7rem .8rem;background:#0d1b2a;border-bottom:3px solid #c8960c;}' +
    '#vm-search input[type=search]{flex:1;min-width:0;font:600 1rem "Source Serif 4",Georgia,serif;padding:.55rem .7rem;border:1px solid #c8960c;border-radius:4px;background:#fff;color:#1a1208;}' +
    '#vm-search select{font:600 .8rem "Source Serif 4",Georgia,serif;padding:.5rem .4rem;border:1px solid #c8960c;border-radius:4px;background:#fff;color:#1a1208;max-width:34vw;}' +
    '#vm-search .vs-close{background:none;border:1px solid rgba(232,184,75,.6);color:#e8b84b;border-radius:4px;padding:.45rem .65rem;font:700 .75rem "Source Serif 4",serif;cursor:pointer;}' +
    '#vm-search .vs-list{overflow:auto;padding:.3rem 0;flex:1;min-height:60px;}' +
    '#vm-search .vs-item{display:block;padding:.6rem .95rem;text-decoration:none;color:inherit;border-left:4px solid transparent;border-bottom:1px solid #e8dcbf;}' +
    '#vm-search .vs-item:hover,#vm-search .vs-item.sel{background:#fdf3d8;border-left-color:#c8960c;}' +
    '#vm-search .vs-t{font:700 .88rem "Playfair Display",Georgia,serif;color:#0d1b2a;}' +
    '#vm-search .vs-s{font-size:.7rem;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#7a5a00;margin-left:.4rem;}' +
    '#vm-search .vs-x{font-size:.8rem;line-height:1.55;color:#3d3020;margin-top:.15rem;}' +
    '#vm-search mark{background:#f6d77a;color:#1a1208;padding:0 1px;border-radius:2px;}' +
    '#vm-search .vs-foot{padding:.4rem .9rem;font-size:.7rem;color:#6b5c40;border-top:1px solid #e8dcbf;background:#f0ebe2;}' +
    '#vm-search .vs-msg{padding:1rem .95rem;font-size:.85rem;color:#6b5c40;}' +
    '.vm-search-btn{display:inline-flex;align-items:center;gap:.4rem;cursor:pointer;font:600 .74rem "Source Serif 4",Georgia,serif;letter-spacing:.5px;' +
      'color:#e8b84b;background:rgba(232,184,75,.1);border:1px solid rgba(232,184,75,.55);border-radius:4px;padding:.4rem .65rem;}' +
    '.vm-search-btn:hover{background:rgba(232,184,75,.22);}' +
    '.vm-search-btn kbd{font:600 .62rem "JetBrains Mono",monospace;border:1px solid rgba(232,184,75,.55);border-radius:3px;padding:0 .3rem;}' +
    '.sidebar .vm-search-btn{margin:.55rem 1.2rem .1rem;width:calc(100% - 2.4rem);justify-content:center;}';

  function build() {
    if (el.root) return;
    var st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    var root = document.createElement('div');
    root.id = 'vm-search';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Buscar nos artigos');
    root.innerHTML =
      '<div class="vs-box">' +
        '<div class="vs-head">' +
          '<input type="search" id="vs-q" placeholder="Buscar por artigo, tema ou tese (ex.: súmula 523, nulidade, art. 65)" autocomplete="off" spellcheck="false" aria-controls="vs-list" aria-label="Termo de busca">' +
          '<select id="vs-subj" aria-label="Filtrar por matéria"><option value="">Todas as matérias</option></select>' +
          '<button type="button" class="vs-close" aria-label="Fechar busca">Esc</button>' +
        '</div>' +
        '<div class="vs-list" id="vs-list" role="listbox" aria-label="Resultados"></div>' +
        '<div class="vs-foot">↑ ↓ navegar · Enter abrir · Esc fechar · busca no texto integral dos artigos publicados</div>' +
      '</div>';
    document.body.appendChild(root);
    el.root = root;
    el.q = root.querySelector('#vs-q');
    el.subj = root.querySelector('#vs-subj');
    el.list = root.querySelector('#vs-list');
    root.addEventListener('mousedown', function(e) { if (e.target === root) close(); });
    root.querySelector('.vs-close').addEventListener('click', close);
    el.q.addEventListener('input', run);
    el.subj.addEventListener('change', run);
    root.addEventListener('keydown', onKey);
    el.list.addEventListener('click', function(e) {
      var a = e.target.closest('.vs-item');
      if (a) { e.preventDefault(); go(+a.getAttribute('data-i')); }
    });
  }

  function msg(t) { el.list.innerHTML = '<div class="vs-msg">' + esc(t) + '</div>'; }

  function ensureIndex() {
    if (state.idx) return Promise.resolve(true);
    msg('Carregando o índice de busca…');
    return Promise.all([VMData.searchIndex(), VMData.manifest()]).then(function(r) {
      if (!r[0]) { msg('Busca indisponível: abra o site pelo endereço publicado (não direto do arquivo no disco).'); return false; }
      state.idx = r[0];
      state.manifest = r[1];
      state.norm = state.idx.map(function(a) {
        return { title: fold(a[1] + ' ' + (a[0].match(/-ART-(\d+)/) || [0, ''])[1]), secs: a[3].map(function(s) { return { h: fold(s[1]), t: fold(s[2]) }; }) };
      });
      if (r[1]) {
        r[1].subjects.forEach(function(s) {
          var o = document.createElement('option');
          o.value = s.id; o.textContent = s.name;
          el.subj.appendChild(o);
        });
      }
      return true;
    });
  }

  function tokens(q) {
    var f = fold(q).replace(/\bart(?:igo)?s?\.?\s*/g, ' ').trim();
    return f.split(/\s+/).filter(function(t) { return t.length > 1 || /\d/.test(t); });
  }

  function search(q, subj) {
    var toks = tokens(q), raw = fold(q).trim();
    if (!toks.length) return [];
    var res = [];
    state.idx.forEach(function(a, ai) {
      if (subj && a[2] !== subj) return;
      var n = state.norm[ai];
      var num = (a[0].match(/-ART-(\d+)/) || [0, ''])[1];
      var titleHit = toks.every(function(t) { return n.title.indexOf(t) >= 0; });
      a[3].forEach(function(s, si) {
        var ns = n.secs[si], score = 0, ok = true;
        for (var k = 0; k < toks.length; k++) {
          var t = toks[k], inT = n.title.indexOf(t) >= 0, inH = ns.h.indexOf(t) >= 0, inX = ns.t.indexOf(t);
          if (!inT && !inH && inX < 0) { ok = false; break; }
          if (inT) score += 8;
          if (inH) score += 5;
          if (inX >= 0) { var c = 0, p = -1; while (c < 5 && (p = ns.t.indexOf(t, p + 1)) >= 0) c++; score += c; }
        }
        if (!ok) return;
        if (toks.length > 1 && ns.t.indexOf(raw) >= 0) score += 10;
        if (/^\d+$/.test(toks[0]) && toks[0] === num) score += 20;
        if (titleHit) score += 4;
        res.push({ ai: ai, si: si, score: score });
      });
    });
    res.sort(function(x, y) { return y.score - x.score; });
    return res.slice(0, MAX_RESULTS);
  }

  function snippet(a, s, toks) {
    var o = s[2], n = fold(o);
    if (o.length !== n.length) { o = n; }
    var at = -1;
    var phrase = toks.join(' ');
    if (toks.length > 1) at = n.indexOf(phrase);                 // frase inteira, se aparece junta
    if (at < 0) {                                                // senão, o termo que menos se repete (ex.: o número "523")
      var rare = Infinity;
      toks.forEach(function(t) {
        var c = 0, p = -1;
        while (c < 60 && (p = n.indexOf(t, p + 1)) >= 0) c++;
        if (c > 0 && c < rare) { rare = c; at = n.indexOf(t); }
      });
    }
    if (at < 0) at = 0;
    var from = Math.max(0, at - 70), to = Math.min(o.length, at + 170);
    var out = '', pos = from;
    var marks = [];
    toks.forEach(function(t) { var p = from; while ((p = n.indexOf(t, p)) >= 0 && p < to) { marks.push([p, p + t.length]); p += t.length; } });
    marks.sort(function(x, y) { return x[0] - y[0]; });
    marks.forEach(function(m) {
      if (m[0] < pos) return;
      out += esc(o.slice(pos, m[0])) + '<mark>' + esc(o.slice(m[0], m[1])) + '</mark>';
      pos = m[1];
    });
    out += esc(o.slice(pos, to));
    return (from > 0 ? '… ' : '') + out + (to < o.length ? ' …' : '');
  }

  function run() {
    var q = el.q.value;
    if (!state.idx) return;
    if (!q.trim()) { state.results = []; msg('Digite para buscar. Exemplos: súmula 523 · transação penal · art. 62 · defesa técnica.'); return; }
    var toks = tokens(q);
    state.results = search(q, el.subj.value);
    state.sel = state.results.length ? 0 : -1;
    if (!state.results.length) { msg('Nenhum resultado para "' + q.trim() + '". Tente menos palavras ou outro termo.'); return; }
    var subjName = {};
    if (state.manifest) state.manifest.subjects.forEach(function(s) { subjName[s.id] = s.short || s.name; });
    el.list.innerHTML = state.results.map(function(r, i) {
      var a = state.idx[r.ai], s = a[3][r.si];
      var href = a[0] + (s[0] ? '#' + s[0] : '');
      return '<a class="vs-item' + (i === 0 ? ' sel' : '') + '" role="option" id="vs-o' + i + '" data-i="' + i + '" href="' + esc(href) + '" aria-selected="' + (i === 0) + '">' +
        '<div><span class="vs-t">' + esc(a[1]) + '</span><span class="vs-s">' + esc(subjName[a[2]] || a[2]) + ' · ' + esc(s[1]) + '</span></div>' +
        '<div class="vs-x">' + snippet(a, s, toks) + '</div></a>';
    }).join('');
    el.q.setAttribute('aria-activedescendant', 'vs-o0');
  }

  function move(d) {
    if (!state.results.length) return;
    var items = el.list.querySelectorAll('.vs-item');
    if (state.sel >= 0 && items[state.sel]) { items[state.sel].classList.remove('sel'); items[state.sel].setAttribute('aria-selected', 'false'); }
    state.sel = (state.sel + d + state.results.length) % state.results.length;
    var it = items[state.sel];
    it.classList.add('sel'); it.setAttribute('aria-selected', 'true');
    el.q.setAttribute('aria-activedescendant', it.id);
    it.scrollIntoView({ block: 'nearest' });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && state.sel >= 0 && document.activeElement === el.q) { e.preventDefault(); go(state.sel); }
    else if (e.key === 'Tab') { e.preventDefault(); el.q.focus(); }   // mantém o foco dentro da janela
  }

  function go(i) {
    var r = state.results[i];
    if (!r) return;
    var a = state.idx[r.ai], s = a[3][r.si];
    var file = a[0], hash = s[0] ? '#' + s[0] : '';
    close();
    var frame = document.getElementById('painel_artigos');
    if (frame) { frame.src = file + hash; return; }                     // índice: abre no quadro
    var sub = state.manifest && state.manifest.subjects.filter(function(x) { return x.id === a[2]; })[0];
    if (sub && /^index(\.html)?$/.test(VMData.currentFile().replace(/\.html$/, ''))) {  // home: abre no visualizador da matéria
      location.href = sub.index + '?art=' + encodeURIComponent(file) + (s[0] ? '&sec=' + encodeURIComponent(s[0]) : '');
      return;
    }
    location.href = file + hash;                                         // dentro de um artigo
  }

  function open() {
    build();
    lastFocus = document.activeElement;
    el.root.classList.add('open');
    state.open = true;
    el.q.value = '';
    ensureIndex().then(function(ok) { if (ok) run(); });
    setTimeout(function() { el.q.focus(); }, 0);
  }

  function close() {
    if (!el.root) return;
    el.root.classList.remove('open');
    state.open = false;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignora */ } }
  }

  function isTyping(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); }

  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); state.open ? close() : open(); }
    else if (e.key === '/' && !state.open && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(); }
  });

  /** Cria o botão "Buscar" onde houver um ponto de encaixe (barra lateral dos índices, menu da home). */
  function mountButtons() {
    build();
    var host = document.querySelector('.sidebar-header');
    if (host && !document.querySelector('.sidebar .vm-search-btn')) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'vm-search-btn';
      b.innerHTML = 'Buscar nos artigos <kbd>Ctrl K</kbd>';
      b.addEventListener('click', open);
      host.insertAdjacentElement('afterend', b);
    }
    var nav = document.getElementById('dashboard') ? document.getElementById('top-nav') : null;   // só na home
    if (nav && !nav.querySelector('.vm-search-btn')) {
      var n = document.createElement('button');
      n.type = 'button'; n.className = 'vm-search-btn'; n.style.marginLeft = 'auto'; n.style.marginRight = '.4rem';
      n.innerHTML = 'Buscar <kbd>Ctrl K</kbd>';
      n.addEventListener('click', open);
      nav.appendChild(n);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButtons);
  else mountButtons();

  window.VMSearch = { open: open, close: close, search: function(q, subj) { return ensureIndex().then(function() { return search(q, subj || ''); }); } };
})(window);
