/**
 * Itens "em breve" (menus e cards da home).
 *
 * A marcação em si é ESTÁTICA: tools/build.py gera <a class="em-breve" aria-disabled="true"> para
 * cada página que ainda não existe (sem href, portanto sem 404 e sem consulta ao servidor).
 * Este arquivo só dá o retorno ao clique: aviso discreto, sem navegar nem fechar o menu.
 */
(function() {
  'use strict';

  var toastEl = null, timer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483647;' +
        'max-width:min(92vw,420px);background:#0d1b2a;color:#f3e7c6;border:1px solid #c8960c;border-left:4px solid #e8b84b;' +
        'border-radius:4px;padding:.6rem .9rem;font:600 .8rem/1.4 "Source Serif 4",Georgia,serif;' +
        'box-shadow:0 6px 22px rgba(0,0,0,.45);display:none;';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(timer);
    timer = setTimeout(function() { toastEl.style.display = 'none'; }, 3500);
  }

  // Captura antes dos demais ouvintes (script.js fecha o menu e rola a página ao clicar num item).
  document.addEventListener('click', function(e) {
    var el = e.target.closest && e.target.closest('.em-breve');
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toast('Em breve: esta página ainda não foi publicada.');
  }, true);

  // Itens sem href não recebem foco; deixa-os alcançáveis por teclado para quem usa leitor de tela.
  function makeFocusable() {
    [].forEach.call(document.querySelectorAll('.menu-artigos a.em-breve'), function(a) {
      a.setAttribute('tabindex', '0');
      a.setAttribute('role', 'link');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', makeFocusable);
  else makeFocusable();

  document.addEventListener('keydown', function(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('em-breve')) {
      e.preventDefault();
      toast('Em breve: esta página ainda não foi publicada.');
    }
  });
})();
