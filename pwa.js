/**
 * Modo offline: registra o service worker (sw.js) e avisa o estado da conexão.
 *  - Só em https:// ou localhost (exigência dos navegadores); em file:// não faz nada.
 *  - Mostra um selo discreto "Sem conexão — usando a cópia salva" quando o aparelho fica offline.
 *  - Quando uma versão nova do site é instalada, avisa para recarregar (sem recarregar sozinho).
 */
(function() {
  'use strict';
  if (window.top !== window.self) return;      // artigos dentro do iframe: quem cuida é a página de fora

  function chip() {
    var el = document.getElementById('vm-offline-chip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'vm-offline-chip';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:12px;z-index:2147483645;display:none;max-width:min(92vw,360px);' +
        'background:#0d1b2a;color:#f3e7c6;border:1px solid #c8960c;border-left:4px solid #e8b84b;border-radius:4px;' +
        'padding:.45rem .75rem;font:600 .74rem/1.4 "Source Serif 4",Georgia,serif;box-shadow:0 4px 16px rgba(0,0,0,.4);';
      document.body.appendChild(el);
    }
    return el;
  }

  function show(msg, ms) {
    var el = chip();
    el.textContent = msg;
    el.style.display = 'block';
    if (ms) { clearTimeout(el._t); el._t = setTimeout(function() { el.style.display = 'none'; }, ms); }
  }

  function status() {
    if (!navigator.onLine) show('Sem conexão. Usando a cópia salva neste aparelho.');
    else if (document.getElementById('vm-offline-chip')) show('Conexão restabelecida.', 2500);
  }
  window.addEventListener('offline', status);
  window.addEventListener('online', status);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { if (!navigator.onLine) status(); });
  else if (!navigator.onLine) status();

  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !secure) return;

  var hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (hadController) show('O site foi atualizado. Recarregue a página para ver as mudanças.', 12000);
    hadController = true;
  });
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').catch(function() { /* sem offline; o site segue normal */ });
  });
})();
