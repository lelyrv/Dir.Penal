#!/usr/bin/env python3
"""
Gerador do Vade Mecum (somente biblioteca padrão do Python 3).

Uso:
    python tools/build.py            gera/atualiza tudo
    python tools/build.py --check    não grava nada; falha (código 1) se algo estiver desatualizado
                                     ou inconsistente (usado pelo CI)

O que ele faz, a partir de catalog.json (a única coisa que se edita à mão):
  1. Menus laterais dos índices (index-penal/civil/clt/jecrim.html): regenera o <nav class="menu-artigos">.
     Páginas que ainda não existem aparecem como "em breve" (sem link, sem 404).
  2. articles.json: manifesto (disponibilidade, título, data de última conferência, seções).
  3. search-index.json: índice de busca de texto integral (carregado sob demanda pela busca Ctrl+K).
  4. Blocos gerenciados nas páginas (<!-- VM-HEAD --> e <!-- VM-RUNTIME -->): meta noindex, manifesto
     PWA, fontes locais e scripts compartilhados. Idempotente.
  5. Carimbo de versão: reescreve ?v=<hash do conteúdo> nas referências a scripts/CSS compartilhados,
     para o navegador nunca usar arquivo antigo (não é mais preciso subir ?v= à mão).
  6. sw.js: service worker (modo offline) com a lista de arquivos a guardar e versão pelo conteúdo.
  7. Cards da home cujo destino não existe viram "em breve".
"""
import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extras  # noqa: E402  (cartões de treino, citações/registro, fila de redação; ver tools/extras.py)
import lint  # noqa: E402  (verificação de padrão; ver tools/lint.py)

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding='utf-8')

# Scripts/CSS compartilhados que recebem ?v=hash nas páginas.
ASSETS = [
    'study-tracker.js', 'study-bar.css', 'article-nav.js', 'article-tools.js', 'search.js', 'vm-data.js',
    'em-breve.js', 'session-banner.js', 'dashboard.js', 'pwa.js', 'fonts.css', 'style.css', 'script.js',
    'vendor/chart.umd.min.js', 'autobackup.js', 'treino.js', 'sumulas.js', 'calc-core.js', 'calculadoras.js',
    'tool-pages.css',
]
ARTICLE_RUNTIME = ['vm-data.js', 'article-nav.js', 'article-tools.js', 'search.js', 'autobackup.js', 'pwa.js']
INDEX_RUNTIME = ['study-tracker.js', 'vm-data.js', 'em-breve.js', 'search.js', 'session-banner.js', 'pwa.js']
HOME_RUNTIME = ['vm-data.js', 'search.js', 'dashboard.js', 'session-banner.js', 'em-breve.js', 'autobackup.js', 'pwa.js']
TOOL_RUNTIME = ['study-tracker.js', 'vm-data.js', 'search.js', 'pwa.js']   # + o script próprio de cada página
INDEX_PAGES = ['index-penal.html', 'index-civil.html', 'index-clt.html', 'index-jecrim.html']
TOOL_PAGES = ['treino.html', 'sumulas.html', 'calculadoras.html']        # páginas de ferramenta (não são artigos)
GENERATED_JSON = ['articles.json', 'citations.json', 'queue.json', 'training.json']
SOON_TITLE = 'Em breve: esta página ainda não foi publicada.'
TOKEN_RE = r'(?:^|\s)%s(?:\s|$)'


# ───────────────────────── utilitários ─────────────────────────
def norm_nl(b):
    return b.replace(b'\r\n', b'\n')


def file_hash(path):
    return hashlib.sha1(norm_nl(Path(path).read_bytes())).hexdigest()[:8]


def read(path):
    return Path(path).read_text(encoding='utf-8').replace('\r\n', '\n')


def strip_tags(s):
    s = re.sub(r'<(script|style)\b.*?</\1>', '', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


class Out:
    """Acumula as saídas; grava ou, em --check, compara com o disco."""

    def __init__(self, check):
        self.check = check
        self.files = {}

    def put(self, rel, text):
        self.files[rel] = text

    def get(self, rel):
        return self.files.get(rel)

    def flush(self):
        changed = []
        for rel, text in sorted(self.files.items()):
            p = ROOT / rel
            cur = read(p) if p.exists() else None
            if cur != text:
                changed.append(rel)
                if not self.check:
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_text(text, encoding='utf-8', newline='\n')
        return changed


# ───────────────────────── leitura das páginas ─────────────────────────
MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
         'outubro', 'novembro', 'dezembro']


def extract_checked(text):
    """Data da última conferência exibida na página (topo + rodapé; os formatos variam).
    Retorna (data ISO parcial, precisão 'dia'|'mês'|'ano', trecho original). Sem data: (None, None, None)."""
    K = r'(?:atualiz\w*|confer\w*)'
    best = None
    for m in re.finditer(K + r'[^0-9]{0,70}?(\d{2})/(\d{2})/(\d{4})', text, re.I):
        iso = '%s-%s-%s' % (m.group(3), m.group(2), m.group(1))
        if best is None or iso > best[0]:
            best = (iso, 'dia', m.group(0).strip())
    if best:
        return best
    for m in re.finditer(K + r'\s+(?:em|até)?\s*([A-Za-zçÇ]+)\s*(?:/|de)\s*(\d{4})', text, re.I):
        if m.group(1).lower() in MESES:
            iso = '%s-%02d' % (m.group(2), MESES.index(m.group(1).lower()) + 1)
            if best is None or iso > best[0]:
                best = (iso, 'mês', m.group(0).strip())
    if best:
        return best
    for m in re.finditer(K + r'\s+(?:em\s+)?(\d{4})(?!\d)', text, re.I):
        if best is None or m.group(1) > best[0]:
            best = (m.group(1), 'ano', m.group(0).strip())
    return best or (None, None, None)


SEC_OPEN = re.compile(
    r'<(?:section|div)\b(?=[^>]*\bclass="(?:[^"]*\s)?(?:section|prova-section)(?:\s[^"]*)?")'
    r'(?=[^>]*\bid="([^"]+)")[^>]*>', re.S)


def scan_article(path):
    t = read(path)
    m = re.search(r'<title>(.*?)</title>', t, re.S)
    title = strip_tags(m.group(1)).split(' | ')[0] if m else path.name
    hero = re.search(r'<header\b[^>]*>.*?</header>', t, re.S)
    hero_text = strip_tags(hero.group(0)) if hero else strip_tags(t[:6000])
    foot = re.search(r'<footer.*?</footer>', t, re.S)
    checked, prec, label = extract_checked(hero_text + ' ' + (strip_tags(foot.group(0)) if foot else ''))
    body = t[t.find('<body'):]
    body = re.sub(r'<!-- VM-STUDY-BAR-START -->.*?<!-- VM-STUDY-BAR-END -->', '', body, flags=re.S)
    marks = list(SEC_OPEN.finditer(body))
    sections, hearing = [], None
    for i, mk in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        chunk = body[mk.start():end]
        chunk = re.split(r'<footer\b', chunk)[0]
        sid = mk.group(1)
        tag = mk.group(0)
        is_prova = 'prova-section' in tag
        if is_prova and hearing is None:
            hearing = sid
        h = re.search(r'class="section-title"[^>]*>(.*?)</div>', chunk, re.S)
        if h:
            heading = strip_tags(re.sub(r'<span\b.*?</span>', '', h.group(1), flags=re.S)) or strip_tags(h.group(1))
        else:
            h = re.search(r'<h[23][^>]*>(.*?)</h[23]>', chunk, re.S)
            heading = strip_tags(h.group(1)) if h else sid
        text = strip_tags(chunk)
        sections.append({'id': sid, 'title': heading, 'text': text[:20000]})
    if not sections:
        sections = [{'id': '', 'title': title, 'text': strip_tags(body)[:20000]}]
    return {
        'title': title, 'checked': checked, 'checkedPrecision': prec, 'checkedLabel': label,
        'sections': sections, 'hearingId': hearing, 'placeholder': 'id="em-elaboracao"' in t,
    }


# ───────────────────────── geração ─────────────────────────
def build_menu(subject, available):
    lines = ['<nav class="menu-artigos">']
    for g in subject['groups']:
        if g['title']:
            lines.append('            <div class="menu-group-title">%s</div>' % html.escape(g['title'], quote=False))
        for it in g['items']:
            label = html.escape(it['label'], quote=False)
            if available.get(it['file']):
                lines.append('            <a href="%s" target="painel_artigos">%s</a>' % (it['file'], label))
            else:
                lines.append('            <a class="em-breve" aria-disabled="true" data-href="%s" title="%s">%s</a>'
                             % (it['file'], SOON_TITLE, label))
    lines.append('        </nav>')
    return '\n'.join(lines)


CARD_RE = re.compile(r'<a class="materia-card (?P<cls>[^"]*?)"(?P<attrs>[^>]*)>(?P<body>.*?)</a>', re.S)


def process_cards(t):
    def fix(m):
        cls = m.group('cls').replace(' em-breve', '').strip()
        attrs = m.group('attrs')
        href = re.search(r'(?:data-)?href="([^"]+)"', attrs).group(1)
        body = re.sub(r'<span class="materia-arrow">.*?</span>', '<span class="materia-arrow">→</span>', m.group('body'))
        if (ROOT / href).exists():
            return '<a class="materia-card %s" href="%s">%s</a>' % (cls, href, body)
        body = body.replace('<span class="materia-arrow">→</span>', '<span class="materia-arrow">Em breve</span>')
        return ('<a class="materia-card %s em-breve" aria-disabled="true" data-href="%s" title="%s">%s</a>'
                % (cls, href, SOON_TITLE, body))
    return CARD_RE.sub(fix, t)


def stamp(t, hashes):
    def sub(m):
        path = m.group('path')
        if path in hashes:
            return '%s="%s?v=%s"' % (m.group('attr'), path, hashes[path])
        return m.group(0)
    return re.sub(r'(?P<attr>src|href)="(?P<path>[^"?#]+)(?:\?v=[0-9a-f]+)?"', sub, t)


def head_block(extra=''):
    return ('<!-- VM-HEAD -->\n'
            '<meta name="robots" content="noindex, nofollow">\n'
            '<meta name="theme-color" content="#0d1b2a">\n'
            '<link rel="manifest" href="manifest.webmanifest">\n'
            '<link rel="icon" type="image/png" href="icons/icon-192.png">\n'
            '<link rel="apple-touch-icon" href="icons/icon-192.png">\n'
            '<script>(function(){try{var u=JSON.parse(localStorage.getItem("vadeMecum_ui")||"{}"),h=document.documentElement;'
            'if(u.dark)h.classList.add("vm-dark");if(u.fs&&u.fs!==100){h.classList.add("vm-zoom");h.style.setProperty("--vm-zoom",u.fs/100);}}catch(e){}})();</script>\n'
            '<link rel="stylesheet" href="fonts.css">\n'
            '<!-- /VM-HEAD -->\n')


def runtime_block(scripts):
    return '<!-- VM-RUNTIME -->\n' + ''.join('<script src="%s"></script>\n' % s for s in scripts) + '<!-- /VM-RUNTIME -->\n'


def normalize(t, scripts, is_home=False):
    # cabeçalho
    t = re.sub(r'<!-- VM-HEAD -->.*?<!-- /VM-HEAD -->\n?', '', t, flags=re.S)
    t = re.sub(r'<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\s*', '', t)
    t = t.replace('</head>', head_block() + '</head>', 1)
    # scripts compartilhados no fim do corpo
    t = re.sub(r'<!-- VM-RUNTIME -->.*?<!-- /VM-RUNTIME -->\n?', '', t, flags=re.S)
    for name in sorted(set(scripts) | {'article-nav.js', 'em-breve.js'}):
        t = re.sub(r'<script src="%s(?:\?v=[0-9a-f]+)?"></script>\s*' % re.escape(name), '', t)
    if is_home and (ROOT / 'vendor/chart.umd.min.js').exists():
        t = re.sub(r'<script src="https://cdnjs\.cloudflare\.com/ajax/libs/Chart\.js/[^"]+"></script>',
                   '<script src="vendor/chart.umd.min.js"></script>', t)
    k = t.rindex('</body>')
    t = t[:k] + runtime_block(scripts) + t[k:]
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--update-baseline', action='store_true',
                    help='reconhece as violações atuais do padrão como "legado" (tools/lint-baseline.json)')
    args = ap.parse_args()
    out = Out(args.check)
    problems, warnings = [], []

    catalog = json.loads(read(ROOT / 'catalog.json'))
    articles = {}
    order = []
    available = {}
    for s in catalog['subjects']:
        for g in s['groups']:
            for it in g['items']:
                f = it['file']
                if f in articles:
                    problems.append('catalog.json: arquivo repetido: %s' % f)
                    continue
                p = ROOT / f
                info = {'subject': s['id'], 'label': it['label'], 'group': g['title'],
                        'kind': it.get('kind', 'artigo'),     # "ferramenta": página de apoio (roteiro), fora das regras de artigo
                        'num': (re.search(r'-ART-(\d+)', f) or [None, None])[1]}
                if p.exists():
                    sc = scan_article(p)
                    info.update({k: sc[k] for k in ('title', 'checked', 'checkedPrecision', 'checkedLabel', 'hearingId')})
                    info['placeholder'] = sc['placeholder']
                    info['sections'] = [{'id': x['id'], 'title': x['title']} for x in sc['sections']]
                    info['available'] = not sc['placeholder']
                    info['_sc'] = sc
                else:
                    info.update({'title': it['label'], 'checked': None, 'checkedPrecision': None, 'checkedLabel': None,
                                 'hearingId': None, 'placeholder': False, 'sections': [], 'available': False})
                info['status'] = 'disponivel' if info['available'] else ('em-elaboracao' if info.get('placeholder') else 'em-breve')
                articles[f] = info
                available[f] = info['available']
                order.append(f)
    on_disk = {p.name for p in ROOT.glob('*-ART-*.html')}
    for f in sorted(on_disk - set(articles)):
        problems.append('arquivo %s existe mas não está em catalog.json' % f)

    # padrão dos artigos publicados (data, pontos recorrentes, emoji, fontes...)
    found = {f: lint.violations(ROOT / f, articles[f]) for f in order
             if articles[f]['available'] and articles[f]['kind'] == 'artigo'}
    if args.update_baseline:
        print('baseline do padrão atualizada: %d páginas com pendências legadas' % lint.write_baseline(found))
    lp, lw, lsum = lint.evaluate(found)
    problems += lp
    warnings += lw
    lint_summary = 'padrão: %d páginas publicadas, %d com pendências LEGADAS conhecidas (baseline); %d violações novas' % (
        len(found), lsum['paginas_com_violacao'], len(lp))

    # 1) menus dos índices
    subj_by_index = {s['index']: s for s in catalog['subjects']}
    page_text = {}
    hashes = {a: file_hash(ROOT / a) for a in ASSETS if (ROOT / a).exists()}
    for idx in INDEX_PAGES:
        t = read(ROOT / idx)
        t = re.sub(r'<nav class="menu-artigos">.*?</nav>', lambda m: build_menu(subj_by_index[idx], available), t, count=1, flags=re.S)
        t = normalize(t, INDEX_RUNTIME)
        page_text[idx] = stamp(t, hashes)
    # home
    t = read(ROOT / 'index.html')
    t = process_cards(t)
    t = normalize(t, HOME_RUNTIME, is_home=True)
    hashes_home = dict(hashes)
    if (ROOT / 'vendor/chart.umd.min.js').exists():
        hashes_home['vendor/chart.umd.min.js'] = file_hash(ROOT / 'vendor/chart.umd.min.js')
    page_text['index.html'] = stamp(t, hashes_home)
    # artigos
    for f in on_disk:
        t = read(ROOT / f)
        t = normalize(t, ARTICLE_RUNTIME)
        page_text[f] = stamp(t, hashes)
    # páginas de ferramenta (treino, súmulas, calculadoras) e páginas de apoio do catálogo (roteiro)
    tools_files = [f for f in TOOL_PAGES if (ROOT / f).exists()] + [f for f in order if articles[f]['kind'] == 'ferramenta' and (ROOT / f).exists()]
    for f in tools_files:
        t = read(ROOT / f)
        own = [m.group(1) for m in re.finditer(r'<script src="([a-z0-9-]+\.js)(?:\?v=[0-9a-f]+)?"></script>', t) if m.group(1) not in TOOL_RUNTIME]
        t = normalize(t, TOOL_RUNTIME + own)
        page_text[f] = stamp(t, hashes)
    for rel, t in page_text.items():
        out.put(rel, t)

    # 2) manifesto
    manifest = {'subjects': [], 'articles': {}}
    for s in catalog['subjects']:
        sc = {k: s[k] for k in ('id', 'name', 'short', 'prefix', 'index')}
        sc['groups'] = [{'title': g['title'], 'items': [i['file'] for i in g['items']]} for g in s['groups']]
        manifest['subjects'].append(sc)
    for f in order:
        a = {k: v for k, v in articles[f].items() if not k.startswith('_')}
        manifest['articles'][f] = a
    out.put('articles.json', json.dumps(manifest, ensure_ascii=False, indent=1) + '\n')

    # 3) índice de busca, um arquivo por matéria (a busca carrega primeiro a matéria da página atual)
    for s in catalog['subjects']:
        idx = []
        for f in order:
            a = articles[f]
            if not a['available'] or a['subject'] != s['id']:
                continue
            idx.append([f, a['title'], a['subject'], [[x['id'], x['title'], x['text']] for x in a['_sc']['sections']]])
        out.put('search-index-%s.json' % s['id'], json.dumps(idx, ensure_ascii=False, separators=(',', ':')) + '\n')

    # 3b) citações de súmulas/teses (+ registro), cartões de treino e fila de redação
    citations = extras.build_citations(articles, order, problems)
    out.put('citations.json', json.dumps({'entries': citations}, ensure_ascii=False, indent=1) + '\n')
    cards = []
    for f in order:
        if articles[f]['available'] and articles[f]['kind'] == 'artigo':
            cards += extras.training_cards(ROOT / f, f, articles[f]['subject'])
    out.put('training.json', json.dumps({'cards': cards}, ensure_ascii=False, separators=(',', ':')) + '\n')
    queue = extras.build_queue(articles, order, extras.load_priorities(problems))
    out.put('queue.json', json.dumps({'items': queue}, ensure_ascii=False, indent=1) + '\n')

    # 4) service worker
    precache_pages = [f for f in order if articles[f]['available']]
    refs = set()
    for rel, t in page_text.items():
        for m in re.finditer(r'(?:src|href)="([^"#]+)"', t):
            u = m.group(1)
            if re.match(r'(https?:|mailto:|javascript:)', u) or u.endswith('.html'):
                continue
            if (ROOT / u.split('?')[0]).exists():
                refs.add(u)
    search_files = ['search-index-%s.json' % s['id'] for s in catalog['subjects']]
    for extra in ['manifest.webmanifest'] + GENERATED_JSON + search_files + ['registry/patterns.json', 'data/laws/CP.json', 'data/laws/L9099.json', 'data/laws/CPP.json', 'data/alteracoes.json']:
        refs.add(extra)
    for p in sorted((ROOT / 'fonts').glob('*')) if (ROOT / 'fonts').exists() else []:
        refs.add('fonts/' + p.name)
    for p in sorted((ROOT / 'icons').glob('*')) if (ROOT / 'icons').exists() else []:
        refs.add('icons/' + p.name)
    critical = ['./', 'index.html'] + INDEX_PAGES + [f for f in tools_files] + sorted(refs)
    pages = [p for p in precache_pages if p not in critical]
    digest = hashlib.sha1()
    for rel in sorted(set(critical + pages)):
        rp = rel.split('?')[0]
        if rp == './':
            continue
        if rp in out.files:
            digest.update(rp.encode() + norm_nl(out.files[rp].encode('utf-8')))
        elif (ROOT / rp).exists():
            digest.update(rp.encode() + norm_nl((ROOT / rp).read_bytes()))
    tpl = read(ROOT / 'tools/sw.template.js')
    sw = (tpl.replace('__VERSION__', digest.hexdigest()[:10])
             .replace('__CRITICAL__', json.dumps(critical, ensure_ascii=False, indent=1))
             .replace('__PAGES__', json.dumps(pages, ensure_ascii=False, indent=1)))
    out.put('sw.js', sw)

    # 5) verificações de consistência
    for rel, t in page_text.items():
        ids = re.findall(r'\sid="([^"]+)"', t)
        dup = sorted({i for i in ids if ids.count(i) > 1})
        if dup:
            problems.append('%s: ids duplicados %s' % (rel, dup[:5]))
        for m in re.finditer(r'(?:src|href)="([^"#?]+)', t):
            u = m.group(1)
            if re.match(r'(https?:|mailto:|javascript:)', u) or not u or u in ('index.html',):
                continue
            if not (ROOT / u).exists() and not u.endswith('/'):
                # destino ausente só é problema se não for item "em breve"
                if 'data-href="%s"' % u in t:
                    continue
                problems.append('%s: referência a arquivo inexistente: %s' % (rel, u))

    changed = out.flush()
    n_av = sum(1 for a in articles.values() if a['available'])
    print('catálogo: %d artigos (%d disponíveis, %d em breve/elaboração)' % (len(articles), n_av, len(articles) - n_av))
    print(lint_summary)
    for w in warnings:
        print('aviso:', w)
    for p in problems:
        print('PROBLEMA:', p)
    if args.check:
        if changed:
            print('DESATUALIZADO (rode: python tools/build.py): %s' % ', '.join(changed[:12]) + (' ...' if len(changed) > 12 else ''))
        ok = not changed and not problems
        print('OK: tudo atualizado e consistente' if ok else 'FALHOU')
        sys.exit(0 if ok else 1)
    print('arquivos atualizados: %d%s' % (len(changed), (' (' + ', '.join(changed[:8]) + (' ...' if len(changed) > 8 else '') + ')') if changed else ''))
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
