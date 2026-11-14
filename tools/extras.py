"""
Geradores auxiliares do build.py:
  - cartões de treino (a partir dos "pontos recorrentes" de cada artigo);
  - citações de súmulas/teses + registro (registry/precedentes.json);
  - fila de redação (artigos "em breve" ordenados por prioridade manual e por indícios objetivos).
"""
import json
import re
from html.parser import HTMLParser

from common import ROOT, read, strip_tags

STATUS = {'vigente', 'cancelada', 'superada', 'alterada', 'nao-verificado'}


# ───────────────────────── cartões de treino ─────────────────────────
class _ProvaParser(HTMLParser):
    """Lê .prova-group / .prova-item (.prova-item-q, .prova-item-a, .qnum, .ref) preservando a ordem."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items, self.group = [], ''
        self.stack = []         # (tag, papel)
        self.cur = None

    def handle_starttag(self, tag, attrs):
        cls = (dict(attrs).get('class') or '').split()
        role = None
        for c in ('prova-group', 'prova-item', 'prova-item-q', 'prova-item-a', 'qnum', 'ref'):
            if c in cls:
                role = c
                break
        if tag in ('br', 'img', 'hr', 'input', 'meta', 'link'):
            return
        self.stack.append((tag, role))
        if role == 'prova-item':
            self.cur = {'group': self.group, 'num': '', 'q': '', 'a': '', 'ref': ''}
        elif role == 'prova-group':
            self.group = ''

    def handle_endtag(self, tag):
        while self.stack:
            t, role = self.stack.pop()
            if role == 'prova-item' and self.cur is not None:
                c = self.cur
                self.cur = None
                for k in ('q', 'a', 'ref', 'num'):
                    c[k] = re.sub(r'\s+', ' ', c[k]).strip()
                if c['q'] and c['a']:
                    self.items.append(c)
            if t == tag:
                break

    def handle_data(self, data):
        roles = [r for _, r in self.stack if r]
        if 'prova-group' in roles:
            self.group += data
        if self.cur is None:
            return
        if 'qnum' in roles:
            self.cur['num'] += data
        elif 'prova-item-q' in roles:
            self.cur['q'] += data
        elif 'prova-item-a' in roles:
            if 'ref' in roles:
                self.cur['ref'] += data + ' '
            self.cur['a'] += data


def training_cards(path, file, subject):
    p = _ProvaParser()
    p.feed(read(path))
    out = []
    for i, it in enumerate(p.items, 1):
        out.append({
            'id': '%s#%s' % (file, it['num'] or '%02d' % i),
            'file': file, 'subject': subject, 'group': re.sub(r'\s+', ' ', it['group']).strip(),
            'q': it['q'], 'a': it['a'], 'ref': it['ref'].strip(),
        })
    return out


# ───────────────────────── citações e registro ─────────────────────────
def load_patterns():
    data = json.loads(read(ROOT / 'registry' / 'patterns.json'))
    comp = []
    for p in data['patterns']:
        comp.append((p, re.compile(p['regex'], re.I)))
    return comp, data['tipos']


def cite_id(p, m):
    trib = p.get('tribunal') or m.group(p['tribunalGroup']).upper()
    return '%s-%s-%s' % (trib, p['tipo'], int(m.group(1)))


def cite_label(cid, tipos):
    trib, tipo, num = cid.split('-')
    if tipo == 'S':
        return 'Súmula %s/%s' % (num, trib)
    if tipo == 'SV':
        return 'Súmula Vinculante %s' % num
    return 'Jurisprudência em Teses %s (STJ)' % num


def find_citations(text, patterns):
    """Retorna {id: contagem} das citações reconhecidas em um texto."""
    found = {}
    taken = []
    for p, rx in patterns:
        for m in rx.finditer(text):
            span = m.span()
            if any(a < span[1] and span[0] < b for a, b in taken):   # não conta duas vezes o mesmo trecho
                continue
            taken.append(span)
            cid = cite_id(p, m)
            found[cid] = found.get(cid, 0) + 1
    return found


def load_registry(problems):
    path = ROOT / 'registry' / 'precedentes.json'
    reg = json.loads(read(path)) if path.exists() else {'entries': {}}
    ents = reg.get('entries', {})
    for cid, e in ents.items():
        if not re.fullmatch(r'(STF|STJ|TST|TSE)-(S|SV|JT)-\d+', cid):
            problems.append('registry/precedentes.json: id inválido: %s' % cid)
            continue
        st = e.get('status')
        if st not in STATUS:
            problems.append('registry/precedentes.json: %s: status inválido "%s" (use %s)' % (cid, st, ', '.join(sorted(STATUS))))
        if st != 'nao-verificado':
            for k in ('enunciado', 'fonte', 'verificadoEm'):
                if not e.get(k):
                    problems.append('registry/precedentes.json: %s: "%s" é obrigatório para entradas verificadas' % (cid, k))
            if e.get('verificadoEm') and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', e['verificadoEm']):
                problems.append('registry/precedentes.json: %s: verificadoEm deve ser AAAA-MM-DD' % cid)
            if e.get('fonte') and not str(e['fonte']).startswith('https://'):
                problems.append('registry/precedentes.json: %s: fonte deve ser um endereço https://' % cid)
    return ents


def build_citations(articles, order, problems):
    """articles[f]['_sc']['sections'] → índice de citações com menções por página/seção."""
    patterns, tipos = load_patterns()
    registry = load_registry(problems)
    entries = {}
    for f in order:
        a = articles[f]
        if not a.get('available'):
            continue
        for s in a['_sc']['sections']:
            for cid, n in find_citations(s['title'] + ' . ' + s['text'], patterns).items():
                e = entries.setdefault(cid, {'mentions': []})
                if not any(m['file'] == f and m['sec'] == s['id'] for m in e['mentions']):
                    e['mentions'].append({'file': f, 'sec': s['id'], 'secTitle': s['title'][:80], 'n': n})
    for cid in registry:
        entries.setdefault(cid, {'mentions': []})
    out = {}
    for cid in sorted(entries, key=lambda c: (c.split('-')[0], c.split('-')[1], int(c.split('-')[2]))):
        reg = registry.get(cid) or {}
        e = {'label': cite_label(cid, tipos), 'tribunal': cid.split('-')[0], 'tipo': cid.split('-')[1],
             'numero': int(cid.split('-')[2]), 'status': reg.get('status', 'nao-verificado'), 'mentions': entries[cid]['mentions']}
        for k in ('enunciado', 'fonte', 'verificadoEm', 'observacao'):
            if reg.get(k):
                e[k] = reg[k]
        out[cid] = e
    return out


# ───────────────────────── fila de redação ─────────────────────────
def build_queue(articles, order, priorities):
    """Itens "em breve" ordenados por prioridade manual (1 a 5) e, depois, por citações em páginas já escritas
    da mesma matéria. A contagem de citações é só um INDÍCIO (a expressão "art. 66" pode se referir a outra lei)."""
    corpus = {}
    for f in order:
        a = articles[f]
        if a.get('available'):
            corpus.setdefault(a['subject'], []).append(' '.join(s['text'] for s in a['_sc']['sections']))
    qual = r'(?!\s*(?:,\s*)?(?:do|da|dos|das)?\s*(?:CPP|CP\b|CPC|CC\b|CF\b|CLT|ECA|LEP|CTN|C[óo]digo|Constitui))'
    queue = []
    for pos, f in enumerate(order):
        a = articles[f]
        if a['available']:
            continue
        num = a.get('num')
        mentions = 0
        if num:
            rx = re.compile(r'\bart(?:igos?|s?\.)\s*' + str(int(num)) + r'(?![\d-])' + qual, re.I)
            mentions = sum(len(rx.findall(t)) for t in corpus.get(a['subject'], []))
        pr = priorities.get(f, {})
        queue.append({'file': f, 'label': a['label'], 'subject': a['subject'], 'mentions': mentions,
                      'peso': pr.get('peso'), 'nota': pr.get('nota', ''), 'pos': pos,
                      'status': a['status']})
    queue.sort(key=lambda x: (-(x['peso'] or 0), -x['mentions'], x['pos']))
    return queue


def load_priorities(problems):
    path = ROOT / 'registry' / 'prioridades.json'
    if not path.exists():
        return {}
    data = json.loads(read(path)).get('itens', {})
    for f, v in data.items():
        if not isinstance(v.get('peso'), int) or not 1 <= v['peso'] <= 5:
            problems.append('registry/prioridades.json: %s: "peso" deve ser inteiro de 1 a 5' % f)
    return data
