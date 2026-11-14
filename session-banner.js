/**
 * Aviso de "sessão de estudo em andamento".
 * Aparece na barra lateral dos índices e na home quando há um cronômetro correndo em OUTRO artigo
 * (no artigo aberto, a própria barra de estudo já mostra o tempo). Atualiza a cada segundo e entre abas.
 * Depende de study-tracker.js e vm-data.js.
 */
(function() {
  'use strict';
  if (!window.VMTracker || !window.VMData) return;

  var T = VMTracker;
  var home = !!document.getElementById('dashboard');
  var frame = document.getElementById('painel_artigos');
  var el = null, manifest = null;

  var css = document.createElement('style');
  css.textContent =
    '.vm-session-banner{display:flex;flex-wrap:wrap;align-items:center;gap:.35rem .6rem;padding:.55rem .75rem;border:1px solid rgba(232,184,75,.7);' +
      'border-left:4px solid #e8b84b;background:rgba(232,184,75,.13);color:#f3e7c6;border-radius:4px;font:600 .74rem/1.4 "Source Serif 4",Georgia,serif;}' +
    '.vm-session-banner[hidden]{display:none;}' +
    '.vm-session-banner .vsb-t{font-family:"JetBrains Mono",monospace;color:#e8b84b;font-weight:600;}' +
    '.vm-session-banner button{cursor:pointer;font:700 .68rem "Source Serif 4",Georgia,serif;letter-spacing:.4px;background:#c8960c;color:#0d1b2a;' +
      'border:1px solid #c8960c;border-radius:3px;padding:.3rem .6rem;}' +
    '.sidebar .vm-session-banner{margin:.5rem 12px .2rem;}' +
    '.vm-session-banner.vm-fixed{position:fixed;left:12px;bottom:54px;z-index:2147483644;max-width:min(92vw,420px);background:#0d1b2a;box-shadow:0 4px 16px rgba(0,0,0,.4);}';
  document.head.appendChild(css);

  function viewingFile() {
    if (!frame) return null;
    try { return frame.contentWindow.location.pathname.split('/').pop(); } catch (e) { return null; }
  }
  function fmt(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' : '') + ('0' + m).slice(-2) + ':' + ('0' + x).slice(-2);
  }

  function build() {
    el = document.createElement('div');
    el.className = 'vm-session-banner' + (home ? ' vm-fixed' : '');
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="vsb-l"></span><span class="vsb-t"></span><button type="button">Ir para o artigo</button>';
    var nav = document.querySelector('.menu-artigos');
    if (!home && nav) nav.parentNode.insertBefore(el, nav); else document.body.appendChild(el);
    el.querySelector('button').addEventListener('click', go);
  }

  function go() {
    var s = T.getActiveSession();
    if (!s) return;
    var file = s.articleFile + '.html';
    var sub = manifest && manifest.subjects.filter(function(x) { return x.id === s.subjectId; })[0];
    var mine = sub && VMData.currentFile() === sub.index;
    if (mine && frame) { frame.src = file; return; }
    if (sub) location.href = sub.index + '?art=' + encodeURIComponent(file);
    else location.href = file;
  }

  function render() {
    if (!el) return;
    var s = T.getActiveSession();
    if (!s || (!home && viewingFile() === s.articleFile + '.html')) { el.hidden = true; return; }
    var paused = s.state === 'paused';
    el.querySelector('.vsb-l').textContent = (paused ? 'Sessão pausada: ' : 'Sessão em andamento: ') +
      (s.subject || '') + ', art. ' + (s.articleNum || s.articleFile);
    el.querySelector('.vsb-t').textContent = fmt(T.activeStudyMs(s));
    el.hidden = false;
  }

  function start() {
    build();
    VMData.manifest().then(function(m) { manifest = m; });
    render();
    setInterval(render, 1000);
    window.addEventListener('storage', render);
    if (frame) frame.addEventListener('load', render);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
