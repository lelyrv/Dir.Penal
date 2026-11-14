/**
 * Menu de atalhos dos artigos: nunca deixa itens escondidos sem aviso.
 *
 *  - Telas largas (>= 700px): se os atalhos não cabem em uma linha, o menu QUEBRA em linhas
 *    (em vez de cortar o que passa da borda) e a margem de rolagem das âncoras é ajustada à
 *    altura real do menu + barra do cronômetro, para o título da seção não ficar escondido.
 *  - Telas estreitas ou menus que rolam de lado (abas): esmaecido na borda direita/esquerda
 *    indicando que há mais itens para o lado.
 *
 * Só atua onde há transbordo; páginas cujo menu já cabe ficam exatamente como estão.
 */
(function() {
  'use strict';

  var NAV_SELECTOR = '#top-nav, .tw, .navbar';
  var nav = document.querySelector(NAV_SELECTOR);

  // ── Acessibilidade: link "Pular para o conteúdo" e nome acessível do menu ──
  var main = document.querySelector('.page-wrap, main') || (nav && nav.nextElementSibling);
  if (main && !document.querySelector('.vm-skip')) {
    if (!main.id) main.id = 'vm-conteudo';
    main.setAttribute('tabindex', '-1');
    main.setAttribute('data-vm-main', '');
    var skip = document.createElement('a');
    skip.className = 'vm-skip';
    skip.href = '#' + main.id;
    skip.textContent = 'Pular para o conteúdo';
    document.body.insertBefore(skip, document.body.firstChild);
  }
  if (nav) {
    if (nav.tagName !== 'NAV' && !nav.getAttribute('role')) nav.setAttribute('role', 'navigation');
    if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', 'Atalhos do artigo');
  }

  if (!nav) return;
  var wrappable = nav.id === 'top-nav';
  var root = document.documentElement;

  var css = document.createElement('style');
  css.id = 'article-nav-css';
  css.textContent =
    '#top-nav.vm-nav-wrap{flex-wrap:wrap!important;overflow:visible!important;}' +
    '#top-nav.vm-nav-wrap .nav-main-links{display:flex;flex-wrap:wrap;flex:1 1 0;min-width:0;}' +
    'html.vm-nav-wrapped [id]{scroll-margin-top:calc(var(--vm-study-bar-h,46px) + var(--vm-nav-h,46px) + 14px)!important;}' +
    '.vm-nav-more-r{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 38px),transparent);' +
      'mask-image:linear-gradient(to right,#000 calc(100% - 38px),transparent);}' +
    '.vm-nav-more-l{-webkit-mask-image:linear-gradient(to left,#000 calc(100% - 38px),transparent);' +
      'mask-image:linear-gradient(to left,#000 calc(100% - 38px),transparent);}' +
    '.vm-nav-more-l.vm-nav-more-r{-webkit-mask-image:linear-gradient(to right,transparent,#000 38px,#000 calc(100% - 38px),transparent);' +
      'mask-image:linear-gradient(to right,transparent,#000 38px,#000 calc(100% - 38px),transparent);}';
  document.head.appendChild(css);

  function overflows() { return nav.scrollWidth - nav.clientWidth > 2; }

  function updateFade() {
    var more = nav.scrollWidth - nav.clientWidth > 2 && !nav.classList.contains('vm-nav-wrap');
    nav.classList.toggle('vm-nav-more-r', more && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
    nav.classList.toggle('vm-nav-more-l', more && nav.scrollLeft > 2);
  }

  function layout() {
    nav.classList.remove('vm-nav-wrap');
    root.classList.remove('vm-nav-wrapped');
    if (wrappable && window.innerWidth >= 700 && overflows()) {
      nav.classList.add('vm-nav-wrap');
      root.classList.add('vm-nav-wrapped');
      root.style.setProperty('--vm-nav-h', nav.offsetHeight + 'px');
    }
    updateFade();
  }

  var raf = null;
  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function() { raf = null; layout(); });
  }

  nav.addEventListener('scroll', updateFade, { passive: true });
  window.addEventListener('resize', schedule);
  window.addEventListener('load', schedule);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  layout();
})();
