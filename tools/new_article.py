#!/usr/bin/env python3
"""
Cria a página de um artigo novo e o inclui no catálogo.

Uso:
  python tools/new_article.py --subject L9099 --num 66 --title "Citação" [--group "Título do grupo"] [--base ARQUIVO.html]

O que faz:
  - copia o "casco" do último artigo publicado da matéria (CSS, barra de estudo, rodapé, scripts) e troca ids e número;
  - pré-preenche o TEXTO LEGAL literal do artigo, copiado do retrato do Planalto (data/laws/);
  - monta o esqueleto padrão (panorama, texto legal, requisitos, fluxograma, prazos, atendimento, jurisprudência,
    doutrina, pontos recorrentes, fontes) com marcadores [[...]] nas partes que exigem pesquisa e conferência;
  - inclui o item no catalog.json (no grupo indicado, ou no último grupo da matéria);
  - a página nasce com <div id="em-elaboracao" hidden>: fica como "em breve" no site. Quando terminar, APAGUE essa linha
    e preencha a data de conferência; o padrão (tools/lint.py) barra a publicação com marcador [[...]] esquecido.

Depois:  python tools/build.py   e   node tests/run.mjs
Opções de teste: --out CAMINHO (grava em outro lugar) e --no-catalog (não mexe no catalog.json).
"""
import argparse
import html
import json
import re
import sys
from pathlib import Path

from common import ROOT, read

SECOES = [
    # id, kicker, título, guia
    ('panorama', 'Introdução e Estrutura', 'Panorama do Art. {n}',
     'Função do dispositivo, onde se encaixa na lei, o que mudou (redações dadas por leis recentes), em poucas linhas. Use cartões (card-grid). Cite só o que conferiu.'),
    ('texto-legal', 'Fonte Oficial', 'Texto Legal',
     'Já preenchido com o texto do Planalto. Confira se há redação nova desde a data do retrato e registre notas de vigência.'),
    ('requisitos', 'Análise do Dispositivo', 'Requisitos e Critérios',
     'Requisitos, hipóteses, exceções e condições, uma coisa por linha. Quadro comparativo (comp-table) quando houver duas ou mais hipóteses.'),
    ('fluxograma', 'Passo a Passo', 'Fluxograma de Aplicação',
     'Sequência de decisões como se faria na audiência (flow-node / flow-arrow). Cada passo com a base legal.'),
    ('prazos', 'Tempo e Forma', 'Prazos e Formalidades',
     'Prazos, contagem, forma dos atos. Indique a fonte de cada prazo (lei, regimento, jurisprudência).'),
    ('atendimento', 'Uso Prático', 'Atendimento e Negociação',
     'Roteiro para autor e para vítima: o que perguntar, o que explicar, riscos e alternativas. Sem prometer resultado.'),
    ('jurisprudencia', 'Tribunais Superiores', 'Jurisprudência: STF, STJ e Fonaje',
     'Só súmulas e teses CONFERIDAS na fonte oficial (marque Oficial, Secundária ou Prática com a etiqueta vb). Súmulas do STF: rode tools/registry_sync.py.'),
    ('doutrina', 'Doutrina', 'Doutrina',
     'Só o que leu em obra ou artigo identificável. Se não encontrou comentário específico sobre este artigo, escreva isso.'),
]


def esc(s):
    return html.escape(s, quote=False)


def law_for(subject_id):
    for l in json.loads(read(ROOT / 'registry' / 'leis.json'))['leis']:
        if l['subject'] == subject_id:
            return l
    return None


def official_text(law, num):
    if not law:
        return None
    p = ROOT / 'data' / 'laws' / (law['id'] + '.json')
    if not p.exists():
        return None
    a = json.loads(read(p))['articles'].get(str(num))
    return a['text'] if a else None


def build_middle(n, title, short, law, text, total_secoes):
    L = []
    w = L.append
    w('<div id="em-elaboracao" hidden></div>   <!-- APAGUE esta linha quando a página estiver pronta -->')
    w('<nav id="top-nav" aria-label="Atalhos do artigo">')
    w('  <div class="nav-brand">Art. %s · %s</div>' % (n, esc(short)))
    w('  <div class="nav-main-links">')
    for sid, _, t, _ in SECOES:
        w('    <a href="#%s">%s</a>' % (sid, esc(t.format(n=n).split(':')[0])))
    w('    <a href="#recorrentes" class="nav-prova">Recorrentes</a>')
    w('    <a href="#fontes">Fontes</a>')
    w('  </div>')
    w('</nav>')
    w('')
    w('<header id="hero">')
    w('  <div class="badge">[[LEI OU CÓDIGO · CAPÍTULO · TÍTULO]] · Conferência normativa em [[DD/MM/AAAA]]</div>')
    w('  <h1>Art. %s — <span>%s</span></h1>' % (n, esc(title)))
    w('  <p class="subtitle">[[PALAVRAS-CHAVE DO ARTIGO SEPARADAS POR ·]]</p>')
    w('  <div class="law-box">')
    w('    <strong>Art. %s %s</strong>' % (n, esc(law['nome'] if law else '[[LEI]]')))
    if text:
        corpo = re.sub(r'^Art\.?\s*%s\s*[º°o.]?\s*[-–]?\s*' % re.escape(str(n)), '', ' '.join(text.split('\n')))
        w('    “%s”' % esc(corpo))
    else:
        w('    “[[TEXTO LITERAL DO ARTIGO, COPIADO DO PLANALTO]]”')
    w('  </div>')
    w('</header>')
    w('')
    w('<div class="page-wrap">')
    num = 0
    for sid, kicker, t, guia in SECOES:
        num += 1
        w('')
        w('<section class="section" id="%s">' % sid)
        w('  <div class="section-header"><div class="section-num">%02d</div><div class="section-title"><span>%s</span>%s</div></div>' % (num, esc(kicker), esc(t.format(n=n))))
        w('  <!-- GUIA: %s -->' % guia)
        if sid == 'texto-legal' and text:
            w('  <div class="law-quote">')
            w('    <strong>Art. %s — texto do Planalto (retrato do repositório; reconfira antes de publicar)</strong>' % n)
            for ln in [x for x in text.split('\n') if x.strip()]:
                w('    <p>%s</p>' % esc(ln))
            w('  </div>')
        else:
            w('  <div class="card"><p>[[PREENCHER: %s]]</p></div>' % esc(t.format(n=n)))
        w('</section>')
    num += 1
    w('')
    w('<section class="prova-section" id="recorrentes">')
    w('  <h2>Pontos que Sempre Aparecem nas Audiências</h2>')
    w('  <p class="intro">Respostas objetivas, com a base legal ou jurisprudencial indicada em cada item, para consulta rápida durante a audiência e no atendimento ao cliente.</p>')
    w('  <div class="prova-items">')
    w('    <div class="prova-group">[[NOME DO GRUPO DE PERGUNTAS]]</div>')
    for i in range(1, 11):
        w('    <div class="prova-item"><div class="prova-item-q"><span class="qnum">%02d</span>[[PERGUNTA %d]]</div><div class="prova-item-a">[[RESPOSTA %d]] <span class="ref">[[BASE LEGAL OU JURISPRUDENCIAL]]</span></div></div>' % (i, i, i))
    w('  </div>')
    w('</section>')
    w('')
    w('<section class="section" id="fontes">')
    w('  <div class="section-header"><div class="section-num">%02d</div><div class="section-title"><span>Controle de Fidedignidade</span>Fontes, Verificação e Ressalvas</div></div>' % (num + 1))
    w('  <div class="card">')
    w('    <h3>Fontes consultadas e grau de verificação (conferência de [[DD/MM/AAAA]])</h3>')
    w('    <div class="tbl-scroll"><table class="comp-table">')
    w('      <thead><tr><th>Fonte</th><th>Uso nesta página</th><th>Situação</th></tr></thead>')
    w('      <tbody>')
    w('        <tr class="hl2"><td>Planalto: %s (texto compilado)</td><td>Art. %s.</td><td><span class="vb vb-of" style="margin-left:0">Oficial, lido</span></td></tr>' % (esc(law['nome'] if law else '[[LEI]]'), n))
    w('        <tr><td>[[OUTRA FONTE]]</td><td>[[USO]]</td><td><span class="vb vb-sec" style="margin-left:0">[[Oficial, lido | Secundária | Prática]]</span></td></tr>')
    w('      </tbody>')
    w('    </table></div>')
    w('    <div class="alert alert-red"><span class="alert-icon"></span><div><strong>Nota de integridade.</strong> Liste aqui o que NÃO foi possível verificar (fontes bloqueadas, acórdãos não lidos no inteiro teor, doutrina não localizada).</div></div>')
    w('  </div>')
    w('</section>')
    w('')
    w('</div><!-- /page-wrap -->')
    w('')
    return '\n'.join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--subject', required=True, help='id da matéria no catalog.json (CP, CC, CLT, L9099)')
    ap.add_argument('--num', required=True, type=int)
    ap.add_argument('--title', required=True, help='título curto do artigo (ex.: "Citação")')
    ap.add_argument('--group', help='título do grupo do menu (padrão: o último da matéria)')
    ap.add_argument('--base', help='artigo usado como casco (padrão: o último publicado da matéria)')
    ap.add_argument('--out', help='grava aqui em vez de na raiz do repositório')
    ap.add_argument('--no-catalog', action='store_true')
    a = ap.parse_args()

    cat = json.loads(read(ROOT / 'catalog.json'))
    sub = next((s for s in cat['subjects'] if s['id'] == a.subject), None)
    if not sub:
        sys.exit('Matéria desconhecida: %s (use uma de: %s)' % (a.subject, ', '.join(s['id'] for s in cat['subjects'])))
    fname = '%s-ART-%d.html' % (sub['prefix'], a.num)
    target = Path(a.out) if a.out else ROOT / fname
    if target.exists():
        sys.exit('Já existe: %s (não sobrescrevo).' % target)

    # casco: último artigo existente da matéria
    base = ROOT / a.base if a.base else None
    if base is None:
        cands = []
        for g in sub['groups']:
            for it in g['items']:
                p = ROOT / it['file']
                if p.exists() and it.get('kind', 'artigo') == 'artigo' and 'id="em-elaboracao"' not in read(p) and 'VM-STUDY-BAR-START' in read(p):
                    cands.append(p)
        if not cands:
            sys.exit('Não há artigo publicado nesta matéria para servir de casco; use --base.')
        base = cands[-1]
    t = read(base)
    pre = t[:t.index('<nav id="top-nav"')]
    suf = t[t.index('<footer'):]
    bid = re.search(r'data-article-id="([^"]+)"', pre).group(1)
    nid = '%s-ART-%d' % (sub['prefix'], a.num)
    pre = pre.replace(bid, nid)
    pre = re.sub(r'data-article-num="[^"]*"', 'data-article-num="%d"' % a.num, pre)
    short = re.search(r'<div class="vm-info"><strong>(.*?)</strong>', pre).group(1)
    pre = re.sub(r'<div class="vm-info">.*?</div>', lambda m: '<div class="vm-info"><strong>%s</strong> &middot; Art.&nbsp;%d</div>' % (short, a.num), pre, count=1, flags=re.S)
    pre = re.sub(r'<title>.*?</title>', lambda m: '<title>Art. %d — %s | %s</title>' % (a.num, esc(a.title), esc(short)), pre, count=1, flags=re.S)
    suf = re.sub(r'<footer>.*?</footer>', lambda m: '<footer><strong>Art. %d — %s</strong> · Página única com atalhos internos · Conferência normativa em [[DD/MM/AAAA]] · Material de apoio à atuação; não substitui a consulta às fontes oficiais.</footer>' % (a.num, esc(a.title)), suf, count=1, flags=re.S)

    law = law_for(sub['id'])
    text = official_text(law, a.num)
    mid = build_middle(a.num, a.title, short, law, text, len(SECOES))
    target.write_text(pre + mid + suf, encoding='utf-8', newline='\n')
    print('criado: %s%s' % (target, '' if text else '  (sem texto no retrato: preencha o texto legal à mão)'))

    if not a.no_catalog:
        label = 'Art. %d - %s' % (a.num, a.title)
        grp = None
        if a.group:
            grp = next((g for g in sub['groups'] if g['title'] == a.group), None)
            if not grp:
                grp = {'title': a.group, 'items': []}
                sub['groups'].append(grp)
        else:
            grp = sub['groups'][-1]
        if not any(i['file'] == fname for g in sub['groups'] for i in g['items']):
            grp['items'].append({'file': fname, 'label': label})
            (ROOT / 'catalog.json').write_text(json.dumps(cat, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
            print('catalog.json: item incluído em "%s"' % grp['title'])
    print('\nPróximos passos:\n  1. preencha todos os [[...]] com conteúdo CONFERIDO nas fontes oficiais;\n  2. apague a linha <div id="em-elaboracao" hidden></div>;'
          '\n  3. rode python tools/registry_sync.py (súmulas do STF) e python tools/build.py;\n  4. rode node tests/run.mjs.')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    main()
