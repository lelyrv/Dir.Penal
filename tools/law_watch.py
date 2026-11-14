#!/usr/bin/env python3
"""
Acompanha o texto das leis no Planalto e confere as transcrições feitas nas páginas do site.

Uso:
  python tools/law_watch.py --update            lê as leis no Planalto e grava o "retrato" em data/laws/ (depois de você
                                                 conferir o relatório; o retrato é a referência das próximas comparações)
  python tools/law_watch.py --check             compara o Planalto de hoje com o retrato: lista artigos alterados,
                                                 acrescentados e revogados (e se há página do site para eles)
  python tools/law_watch.py --transcriptions    compara o texto legal que cada página transcreve com o retrato
  Opções: --law CP (uma lei só)  --report arquivo.md (grava o relatório)

Códigos de saída de --check:  0 sem mudanças · 2 mudanças encontradas · 3 Planalto indisponível (NÃO é alarme de mudança).

Zero alarme falso por indisponibilidade: se a página não carrega, se vem sem artigos ou com muito menos artigos que o
retrato, o resultado é "indisponível". Mudança só é declarada com a página lida por completo.
"""
import argparse
import datetime
import difflib
import hashlib
import html
import json
import re
import sys

from common import ROOT, fetch, read

LAWS_DIR = ROOT / 'data' / 'laws'


def to_lines(raw):
    t = re.sub(r'<(script|style)\b.*?</\1>', '', raw, flags=re.S | re.I)
    t = re.sub(r'<s>.*?</s>|<strike>.*?</strike>', '', t, flags=re.S | re.I)         # texto tachado (revogado) sai
    t = re.sub(r'\s+', ' ', t)             # quebras de linha do código-fonte não são fim de parágrafo ("Art. ⏎ 115.")
    t = re.sub(r'</p>|<br\s*/?>|</div>|</h\d>|</tr>|</li>', '\n', t, flags=re.I)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t).replace('\xa0', ' ')
    lines = [re.sub(r'\s+', ' ', x).strip() for x in t.split('\n')]
    return [x for x in lines if x]


ART_RE = re.compile(r'^Art\.?\s*(\d{1,3}\.\d{3}|\d{1,4})(?:-([A-Z])(?![A-Za-zà-ú]))?\s*(?:[º°o]|\.)?(?=\s|$|[-–—.])')


def parse_articles(raw):
    """{ '28': texto, '75-A': texto } a partir do HTML do Planalto. Mantém a primeira ocorrência de cada número."""
    arts, cur, last = {}, None, None
    for line in to_lines(raw):
        m = ART_RE.match(line)
        if m:
            digits = m.group(1).replace('.', '')                  # "1.000" → 1000
            num = digits + ('-' + m.group(2) if m.group(2) else '')
            n = int(digits)
            if num not in arts and (last is None or (n >= last - 1 and n <= last + 400)):    # numeração plausível (ignora citações soltas)
                cur = num
                arts[cur] = [line]
                last = n if last is None else max(last, n)
                continue
        if cur:
            arts[cur].append(line)
    return {k: '\n'.join(_trim_headings(v)) for k, v in arts.items()}


def _trim_headings(lines):
    """Tira do fim de um artigo os títulos do artigo seguinte (ex.: "Emoção e paixão"): linhas curtas, sem pontuação final."""
    while len(lines) > 1:
        l = lines[-1]
        core = re.sub(r'\([^)]*\)\s*$', '', l).rstrip()
        if (len(core.split()) <= 10 and not re.match(r'^(§|Par[áa]grafo|[IVXLC]+\s*[-–]|[a-z]\)|\(|Art\.)', l)
                and not re.search(r'[.:;]$', core)):
            lines.pop()
        else:
            break
    return lines


def norm_text(s):
    return re.sub(r'\s+', ' ', s).strip()


def h(s):
    return hashlib.sha1(norm_text(s).encode('utf-8')).hexdigest()[:12]


def laws(only=None):
    data = json.loads(read(ROOT / 'registry' / 'leis.json'))['leis']
    return [x for x in data if not only or x['id'] == only]


def load_snapshot(lid):
    p = LAWS_DIR / (lid + '.json')
    return json.loads(read(p)) if p.exists() else None


def tracked_pages(subject):
    """{numero_do_artigo: arquivo} das páginas publicadas da matéria."""
    cat = json.loads(read(ROOT / 'catalog.json'))
    out = {}
    for s in cat['subjects']:
        if s['id'] != subject:
            continue
        for g in s['groups']:
            for it in g['items']:
                m = re.search(r'-ART-(\d+)\.html$', it['file'])
                if m and (ROOT / it['file']).exists() and 'id="em-elaboracao"' not in read(ROOT / it['file']):
                    out[str(int(m.group(1)))] = it['file']
    return out


def fetch_law(law):
    st, body, err = fetch(law['url'], timeout=60, retries=2)
    if not body:
        return None, 'indisponível (%s)' % (err or st)
    arts = parse_articles(body)
    return arts, None


def cmd_update(only):
    LAWS_DIR.mkdir(parents=True, exist_ok=True)
    rc = 0
    for law in laws(only):
        arts, err = fetch_law(law)
        if not arts or len(arts) < 5:
            print('%s: não atualizado (%s)' % (law['id'], err or 'poucos artigos lidos: %d' % len(arts or {})))
            rc = 3
            continue
        snap = {'id': law['id'], 'nome': law['nome'], 'url': law['url'], 'lidoEm': datetime.date.today().isoformat(),
                'total': len(arts), 'articles': {k: {'hash': h(v), 'text': norm_text_lines(v)} for k, v in arts.items()}}
        (LAWS_DIR / (law['id'] + '.json')).write_text(json.dumps(snap, ensure_ascii=False, indent=0) + '\n', encoding='utf-8', newline='\n')
        print('%s: retrato gravado com %d artigos' % (law['id'], len(arts)))
    return rc


def norm_text_lines(s):
    return '\n'.join(re.sub(r'\s+', ' ', x).strip() for x in s.split('\n') if x.strip())


def cmd_check(only, report):
    lines, changed_any, unavailable = [], False, False
    for law in laws(only):
        snap = load_snapshot(law['id'])
        if not snap:
            lines.append('- **%s**: sem retrato salvo (rode --update).' % law['id'])
            continue
        arts, err = fetch_law(law)
        if not arts or len(arts) < 0.8 * snap['total']:
            unavailable = True
            lines.append('- **%s**: Planalto %s; nada foi comparado (isto NÃO indica mudança na lei).' % (
                law['id'], err or 'respondeu com texto incompleto (%d de %d artigos)' % (len(arts or {}), snap['total'])))
            continue
        pages = tracked_pages(law['subject'])
        diffs = []
        for num, txt in arts.items():
            old = snap['articles'].get(num)
            if old is None:
                diffs.append(('acrescentado', num, '', txt))
            elif old['hash'] != h(txt):
                diffs.append(('alterado', num, old['text'], norm_text_lines(txt)))
        for num, old in snap['articles'].items():
            if num not in arts:
                diffs.append(('ausente', num, old['text'], ''))
        if not diffs:
            lines.append('- **%s**: sem mudanças (%d artigos conferidos; retrato de %s).' % (law['id'], len(arts), snap['lidoEm']))
            continue
        changed_any = True
        lines.append('- **%s**: %d artigo(s) com diferença em relação ao retrato de %s:' % (law['id'], len(diffs), snap['lidoEm']))
        for kind, num, old, new in sorted(diffs, key=lambda d: (int(re.match(r'\d+', d[1]).group()), d[1]))[:60]:
            page = pages.get(re.match(r'\d+', num).group())
            tag = ' (**há página no site: %s; reconferir**)' % page if page and '-' not in num else ''
            lines.append('  - art. %s %s%s' % (num, kind, tag))
            if kind == 'alterado':
                a, b = old.split(), new.split()
                sm = difflib.SequenceMatcher(None, a, b)
                for op, i1, i2, j1, j2 in sm.get_opcodes():
                    if op != 'equal':
                        lines.append('      - antes: "%s" | agora: "%s"' % (' '.join(a[max(0, i1 - 2):i2 + 1])[:160], ' '.join(b[max(0, j1 - 2):j2 + 1])[:160]))
                        break
    out = '\n'.join(lines)
    print(out)
    if report:
        head = '# Verificação das leis no Planalto (%s)\n\n' % datetime.date.today().isoformat()
        (ROOT / report).write_text(head + out + '\n', encoding='utf-8', newline='\n')
    if changed_any:
        return 2
    return 3 if unavailable else 0


# ───────── transcrições nas páginas ─────────
def quote_text(page_html):
    """Texto legal transcrito: a caixa .law-box do topo (sem o rótulo em <strong>)."""
    m = re.search(r'<div class="law-box">(.*?)</div>', page_html, re.S)
    if not m:
        return None
    inner = re.sub(r'<strong\b[^>]*>.*?</strong>', ' ', m.group(1), flags=re.S)
    return ' '.join(to_lines(inner))


def squash(s):
    s = s.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
    s = re.sub(r'\((?:Reda[çc][ãa]o|Inclu[ií]d|Revogad|Vide|Vig[êe]ncia|Regulamento|Produ[çc][ãa]o)[^)]*\)', ' ', s, flags=re.I)
    s = re.sub(r'^\s*Art\.?\s*\d+(?:-[A-Z])?\s*[º°o.]?\s*[-–—]?\s*', '', s)
    s = re.sub(r'[^\wáéíóúâêôãõçà§º°-]+', ' ', s.lower())
    return re.sub(r'\s+', ' ', s).strip()


def cmd_transcriptions(only, report, threshold=0.90):
    rows = []
    for law in laws(only):
        snap = load_snapshot(law['id'])
        if not snap:
            continue
        for num, f in sorted(tracked_pages(law['subject']).items(), key=lambda kv: int(kv[0])):
            off = snap['articles'].get(num)
            q = quote_text(read(ROOT / f))
            if not off or not q:
                rows.append((f, None, 'sem caixa de texto legal reconhecida' if not q else 'artigo %s não está no retrato' % num))
                continue
            a, b = squash(q), squash(off['text'])
            # a página pode transcrever só o caput ou parte do artigo: compara com o melhor trecho do mesmo tamanho
            ratio = difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() if len(b) < 6000 else 0.0
            if len(a) < len(b) * 0.8:
                sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
                matched = sum(bl.size for bl in sm.get_matching_blocks())
                ratio = matched / max(1, len(a))
            rows.append((f, round(ratio, 3), 'ok' if ratio >= threshold else 'semelhança abaixo do limite: revisar (pode ser legenda, versão antiga ou comentário na caixa)'))
    lines = ['- %s: %s (%s)' % (f, ('%.0f%%' % (r * 100)) if r is not None else 's/ medida', msg) for f, r, msg in rows]
    bad = [x for x in rows if x[1] is None or x[1] < threshold]
    lines.append('')
    lines.append('%d páginas comparadas; %d acima de %.0f%% de semelhança; %d para revisar.' % (len(rows), len(rows) - len(bad), threshold * 100, len(bad)))
    out = '\n'.join(lines)
    print(out)
    if report:
        (ROOT / report).write_text('# Transcrições x texto oficial (%s)\n\n%s\n' % (datetime.date.today().isoformat(), out), encoding='utf-8', newline='\n')
    return 0


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--update', action='store_true')
    g.add_argument('--check', action='store_true')
    g.add_argument('--transcriptions', action='store_true')
    ap.add_argument('--law')
    ap.add_argument('--report')
    a = ap.parse_args()
    if a.update:
        sys.exit(cmd_update(a.law))
    if a.check:
        sys.exit(cmd_check(a.law, a.report))
    sys.exit(cmd_transcriptions(a.law, a.report))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    main()
