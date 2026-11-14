#!/usr/bin/env python3
"""
Gera L9099-ROTEIRO.html: roteiro do procedimento dos Juizados Especiais Criminais (Lei 9.099/1995, arts. 66 a 92),
com o TEXTO LITERAL de cada artigo (do retrato data/laws/L9099.json, lido no Planalto) na ordem em que a lei dispõe os atos.

Não traz doutrina nem jurisprudência: isso vem nos fluxogramas de cada artigo (arts. 60 a 65 já publicados).
Os rótulos de cada passo apenas identificam o assunto do artigo.

Uso:  python tools/gen_roteiro.py     (depois: python tools/build.py)
O teste tests/static.test.mjs confere que cada trecho do roteiro é idêntico ao do retrato.
"""
import html
import json
import re
import sys

from common import ROOT, read

ETAPAS = [
    ('citacao', 'Citação e intimação', 'Como o acusado e as partes são chamados ao Juizado.',
     [(66, 'Citação'), (67, 'Intimações'), (68, 'Comparecimento com advogado')]),
    ('preliminar', 'Fase preliminar', 'Do termo circunstanciado à audiência preliminar, à composição dos danos civis e à transação penal.',
     [(69, 'Termo circunstanciado'), (70, 'Designação da audiência preliminar'), (71, 'Falta de comparecimento'),
      (72, 'Audiência preliminar'), (73, 'Conciliação'), (74, 'Composição dos danos civis'), (75, 'Representação'),
      (76, 'Transação penal (proposta do Ministério Público)')]),
    ('sumarissimo', 'Procedimento sumaríssimo', 'Da denúncia oral à audiência de instrução e julgamento.',
     [(77, 'Denúncia oral'), (78, 'Denúncia reduzida a termo e ciência da audiência'),
      (79, 'Conciliação e proposta na audiência de instrução e julgamento'), (80, 'Vedação de adiamento dos atos'),
      (81, 'Audiência de instrução e julgamento')]),
    ('recursos', 'Recursos', 'Apelação e embargos de declaração.', [(82, 'Apelação'), (83, 'Embargos de declaração')]),
    ('execucao', 'Execução da pena', 'Pagamento da multa e execução das demais penas.',
     [(84, 'Pena de multa: pagamento'), (85, 'Multa não paga: conversão'), (86, 'Execução das penas privativas de liberdade e restritivas de direitos'),
      (87, 'Despesas processuais')]),
    ('complementares', 'Representação, suspensão do processo e disposições complementares', 'Regras que complementam o rito.',
     [(88, 'Representação nas lesões corporais leves e culposas'), (89, 'Suspensão condicional do processo'),
      (90, 'Processos com instrução já iniciada'), (91, 'Representação: regra de transição'),
      (92, 'Aplicação subsidiária do Código Penal e do Código de Processo Penal')]),
]
FERRAMENTAS = {89: ('calculadoras.html#scpp', 'Calculadora da suspensão condicional do processo')}


def esc(s):
    return html.escape(s, quote=True)


def clean_text(t):
    """Texto do artigo como no retrato (sem o "Art. N." inicial e sem anotações de vigência sozinhas em linha)."""
    return t


def main():
    snap = json.loads(read(ROOT / 'data' / 'laws' / 'L9099.json'))
    arts = snap['articles']
    lido = snap['lidoEm'].split('-')[::-1]
    cat = json.loads(read(ROOT / 'catalog.json'))
    paginas = {}
    for s in cat['subjects']:
        if s['id'] == 'L9099':
            for g in s['groups']:
                for it in g['items']:
                    m = re.search(r'-ART-(\d+)\.html$', it['file'])
                    if m and (ROOT / it['file']).exists():
                        paginas[int(m.group(1))] = (it['file'], it['label'])
    out = []
    w = out.append
    w('<!DOCTYPE html>')
    w('<html lang="pt-BR">')
    w('<head>')
    w('<meta charset="UTF-8">')
    w('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    w('<title>Roteiro do procedimento dos Juizados Criminais | Lei 9.099/95</title>')
    w('<script>if(self!==top)document.documentElement.classList.add("in-frame");</script>')
    w('<link rel="stylesheet" href="tool-pages.css">')
    w('<style>')
    w('.in-frame .tp-top{display:none;}.in-frame .tp-main{padding-top:1rem;}')
    w('.rt-nav{display:flex;flex-wrap:wrap;gap:.4rem;margin:1rem 0 0;padding:0;list-style:none;}')
    w('.rt-nav a{display:inline-block;padding:.4rem .75rem;border:1px solid var(--gold);border-radius:999px;color:#7a5a00;text-decoration:none;font-size:.78rem;font-weight:700;background:#fff;}')
    w('.rt-nav a:hover{background:var(--gold-pale);}')
    w('.rt-step{background:#fff;border:1px solid var(--border-light);border-left:5px solid var(--navy);border-radius:6px;padding:.9rem 1.1rem;margin:0 0 .9rem;box-shadow:0 3px 16px rgba(13,27,42,.07);scroll-margin-top:70px;}')
    w('.rt-step h3{margin:0 0 .4rem;font:700 1.02rem "Playfair Display",Georgia,serif;color:var(--navy);}')
    w('.rt-step h3 span{color:#7a5a00;}')
    w('.rt-law{margin:.3rem 0 .5rem;padding:.55rem .8rem;border-left:3px solid var(--border);background:var(--cream);font-size:.88rem;line-height:1.7;}')
    w('.rt-law p{margin:.15rem 0;}')
    w('.rt-links{display:flex;flex-wrap:wrap;gap:.4rem 1rem;font-size:.8rem;}')
    w('.rt-links a{color:var(--blue);}.rt-soon{color:var(--text-soft);font-style:italic;}')
    w('</style>')
    w('</head>')
    w('<body>')
    w('<a class="tp-skip" href="#conteudo">Pular para o conteúdo</a>')
    w('<header class="tp-top">')
    w('  <a class="tp-back" href="index.html" target="_top">← Início</a>')
    w('  <span class="tp-title">Roteiro do procedimento</span>')
    w('  <nav class="tp-nav" aria-label="Ferramentas">')
    w('    <a href="treino.html" target="_top">Treino</a>')
    w('    <a href="sumulas.html" target="_top">Súmulas e teses</a>')
    w('    <a href="calculadoras.html" target="_top">Calculadoras</a>')
    w('    <a href="L9099-ROTEIRO.html" aria-current="page">Roteiro Lei 9.099</a>')
    w('  </nav>')
    w('</header>')
    w('<main id="conteudo" class="tp-main">')
    w('<header id="hero" style="margin:0 0 1rem">')
    w('<h1>Roteiro do procedimento <span>dos Juizados Criminais</span></h1>')
    w('<p class="tp-lead">Lei nº 9.099/1995, arts. 66 a 92: a ordem dos atos, com o texto literal de cada artigo. Conferência normativa em %s.</p>' % '/'.join(lido))
    w('</header>')
    w('<div class="tp-note"><strong>O que é esta página.</strong> Um roteiro textual: a sequência dos atos como a própria lei a dispõe, com o texto do Planalto copiado sem alteração. Ela não traz doutrina nem jurisprudência. Os fluxogramas completos de cada artigo (arts. 60 a 65 já publicados) trazem doutrina, súmulas e teses, com a fonte de cada informação; os artigos ainda sem fluxograma aparecem como "em breve". O texto foi lido do compilado do Planalto em %s e é conferido todo mês; antes de citar, confira no endereço oficial.</div>' % '/'.join(lido))

    # disposições gerais (artigos já publicados)
    w('<section class="section" id="gerais">')
    w('<div class="section-header"><div class="section-title">Disposições gerais (arts. 60 a 65)</div></div>')
    w('<p class="tp-src">Competência, infrações de menor potencial ofensivo, critérios do processo, competência territorial, publicidade e validade dos atos.</p>')
    w('<ul>')
    for n in range(60, 66):
        if n in paginas:
            f, lab = paginas[n]
            w('<li><a href="%s">%s</a></li>' % (esc(f), esc(lab)))
        else:
            w('<li>Art. %d <span class="rt-soon">(em breve)</span></li>' % n)
    w('</ul>')
    w('<p class="tp-src">Para conferir se uma pena se enquadra no art. 61: <a href="calculadoras.html#menor" target="_top">calculadora de menor potencial ofensivo</a>.</p>')
    w('</section>')

    w('<ul class="rt-nav" aria-label="Etapas do procedimento">')
    for sid, titulo, _, _ in ETAPAS:
        w('<li><a href="#%s">%s</a></li>' % (sid, esc(titulo)))
    w('</ul>')

    for sid, titulo, resumo, itens in ETAPAS:
        w('<section class="section" id="%s">' % sid)
        w('<div class="section-header"><div class="section-title">%s</div></div>' % esc(titulo))
        w('<p class="tp-src">%s</p>' % esc(resumo))
        for n, rotulo in itens:
            a = arts[str(n)]
            linhas = [x for x in a['text'].split('\n') if x.strip()]
            w('<article class="rt-step" id="art-%d" data-art="%d">' % (n, n))
            w('<h3><span>Art. %d</span> · %s</h3>' % (n, esc(rotulo)))
            w('<div class="rt-law">')
            for ln in linhas:
                w('<p>%s</p>' % esc(ln))
            w('</div>')
            links = []
            if n in paginas:
                links.append('<a href="%s">Fluxograma completo</a>' % esc(paginas[n][0]))
            else:
                links.append('<span class="rt-soon">Fluxograma completo: em breve</span>')
            if n in FERRAMENTAS:
                links.append('<a href="%s" target="_top">%s</a>' % FERRAMENTAS[n])
            links.append('<a href="%s" target="_blank" rel="noopener">Planalto</a>' % esc(snap['url']))
            w('<div class="rt-links">%s</div>' % ' '.join(links))
            w('</article>')
        w('</section>')

    w('<p class="tp-src">Arts. 93 a 97 (organização estadual dos Juizados, instalação, vigência e revogações) não fazem parte do rito e não foram transcritos aqui.</p>')
    w('</main>')
    w('</body>')
    w('</html>')
    (ROOT / 'L9099-ROTEIRO.html').write_text('\n'.join(out) + '\n', encoding='utf-8', newline='\n')
    print('L9099-ROTEIRO.html gerado: %d passos' % sum(len(e[3]) for e in ETAPAS))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    main()
