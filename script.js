/* ============================================================
   MENU LATERAL + IFRAME AUTOMÁTICO
   ============================================================ */

/* ── ABRIR / FECHAR MENU LATERAL ── */
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');

    if (!sidebar) return;

    sidebar.classList.toggle('closed');

    document.body.classList.toggle(
        'sidebar-closed',
        sidebar.classList.contains('closed')
    );
}

/* ── FECHAR MENU LATERAL ── */
function fecharMenuLateral() {
    const sidebar = document.getElementById('sidebar');

    if (!sidebar) return;

    sidebar.classList.add('closed');
    document.body.classList.add('sidebar-closed');
}

/* ── ABRIR MENU LATERAL ── */
function abrirMenuLateral() {
    const sidebar = document.getElementById('sidebar');

    if (!sidebar) return;

    sidebar.classList.remove('closed');
    document.body.classList.remove('sidebar-closed');
}

/* ── ALTURA AUTOMÁTICA DO IFRAME ── */
function ajustarAlturaIframe() {
    const iframe = document.getElementById('painel_artigos');

    if (!iframe) return;

    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        if (!doc) return;

        const html = doc.documentElement;
        const body = doc.body;

        if (!html || !body) return;

        const altura = Math.max(
            body.scrollHeight,
            body.offsetHeight,
            html.clientHeight,
            html.scrollHeight,
            html.offsetHeight
        );

        iframe.classList.add('auto-height');
        iframe.style.setProperty('--iframe-height', altura + 'px');

        document.documentElement.style.setProperty('--iframe-height', altura + 'px');
    } catch (erro) {
        iframe.classList.remove('auto-height');
        iframe.style.removeProperty('--iframe-height');

        console.warn(
            'Não foi possível ajustar automaticamente o iframe. Verifique se o conteúdo está no mesmo domínio/origem.',
            erro
        );
    }
}

/* ── OBSERVA MUDANÇAS DENTRO DO IFRAME ── */
function observarIframe() {
    const iframe = document.getElementById('painel_artigos');

    if (!iframe) return;

    try {
        const doc = iframe.contentDocument || iframe.contentWindow.document;

        if (!doc) return;

        ajustarAlturaIframe();

        if (doc.fonts && doc.fonts.ready) {
            doc.fonts.ready.then(ajustarAlturaIframe);
        }

        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(ajustarAlturaIframe);

            if (doc.documentElement) resizeObserver.observe(doc.documentElement);
            if (doc.body) resizeObserver.observe(doc.body);
        }

        if (window.MutationObserver && doc.body) {
            const mutationObserver = new MutationObserver(ajustarAlturaIframe);

            mutationObserver.observe(doc.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
            });
        }

        setTimeout(ajustarAlturaIframe, 100);
        setTimeout(ajustarAlturaIframe, 300);
        setTimeout(ajustarAlturaIframe, 700);
        setTimeout(ajustarAlturaIframe, 1200);
    } catch (erro) {
        console.warn('Não foi possível observar alterações no iframe.', erro);
    }
}

/* ── INICIALIZAÇÃO ── */
document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const iframe = document.getElementById('painel_artigos');
    const contentArea = document.querySelector('.content-area');
    const linksMenu = document.querySelectorAll('.menu-artigos a');

    /*
       Estado inicial:
       - sidebar aberta
       - body sem classe sidebar-closed
    */
    if (sidebar && sidebar.classList.contains('closed')) {
        document.body.classList.add('sidebar-closed');
    } else {
        document.body.classList.remove('sidebar-closed');
    }

    /* Fecha o menu automaticamente ao clicar em qualquer artigo */
    linksMenu.forEach(link => {
        link.addEventListener('click', () => {
            linksMenu.forEach(item => item.classList.remove('active'));
            link.classList.add('active');

            /*
               FECHA SEMPRE:
               desktop, tablet e celular.
               Se quiser fechar só no celular, coloque novamente:
               if (window.innerWidth < 768) { fecharMenuLateral(); }
            */
            fecharMenuLateral();

            if (contentArea) {
                contentArea.scrollTo({
                    top: 0,
                    behavior: 'auto'
                });
            }

            setTimeout(ajustarAlturaIframe, 150);
            setTimeout(ajustarAlturaIframe, 400);
            setTimeout(ajustarAlturaIframe, 900);
        });
    });

    /* Marca o primeiro link como ativo ao carregar */
    if (linksMenu.length > 0) {
        linksMenu[0].classList.add('active');
    }

    /* Ajusta iframe ao carregar novo artigo */
    if (iframe) {
        iframe.addEventListener('load', () => {
            if (contentArea) {
                contentArea.scrollTo({
                    top: 0,
                    behavior: 'auto'
                });
            }

            observarIframe();
            ajustarAlturaIframe();
        });
    }

    ajustarAlturaIframe();
});

/* ── AJUSTES GLOBAIS ── */
window.addEventListener('load', ajustarAlturaIframe);
window.addEventListener('resize', ajustarAlturaIframe);
window.addEventListener('beforeprint', ajustarAlturaIframe);