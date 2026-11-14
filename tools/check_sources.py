#!/usr/bin/env python3
"""
Verifica se os links externos citados no site (fontes oficiais: Planalto, STJ, STF, CNJ, TST...) continuam no ar.

Uso:  python tools/check_sources.py [--report relatorio.md] [--limit N] [--host planalto.gov.br]

Classificação de cada endereço:
  ok              resposta 2xx/3xx (e o início da página não diz "não encontrada")
  quebrado        404/410, domínio que não resolve, ou conexão recusada de forma definitiva
  suspeito        status 200, mas o início da página fala em "página não encontrada"/"não existe"
  instavel        timeout, 5xx ou erro de rede depois de 2 tentativas (pode ser só o servidor fora do ar)
  nao-verificavel o site bloqueia robôs (403/429, ou domínios conhecidos por isso): NÃO conta como defeito

Código de saída: 0 sem quebrados/suspeitos · 2 há quebrados ou suspeitos (quem chamar decide se avisa).
"""
import argparse
import concurrent.futures
import datetime
import re
import sys
import threading
import time
from collections import defaultdict
from urllib.parse import urlparse

from common import ROOT, probe, read

# Sites que costumam recusar acesso automático: resposta de bloqueio não é prova de link quebrado.
HOSTILE = ('stj.jus.br', 'scon.stj.jus.br', 'processo.stj.jus.br', 'tst.jus.br', 'tse.jus.br')
SOFT404 = re.compile(r'p[áa]gina\s+n[ãa]o\s+(?:foi\s+)?encontrada|n[ãa]o\s+foi\s+poss[ií]vel\s+encontrar|conte[úu]do\s+n[ãa]o\s+(?:existe|dispon[ií]vel)|'
                     r'<title>[^<]{0,40}(?:404|n[ãa]o encontrad)', re.I)
SKIP_HOSTS = ('www.w3.org', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com')
_lock = threading.Lock()
_last = defaultdict(float)


def classify(status, err, host, head):
    """Pura (testável): (status HTTP, erro, host, início do corpo) → classe."""
    hostile = any(host == h or host.endswith('.' + h) for h in HOSTILE)
    if status in (404, 410):
        return 'nao-verificavel' if hostile else 'quebrado'
    if status in (401, 403, 429):
        return 'nao-verificavel'
    if 200 <= status < 400:
        return 'suspeito' if SOFT404.search(head or '') else 'ok'
    if status == 0 and err and re.search(r'Name or service not known|getaddrinfo|nodename nor servname|Temporary failure in name resolution|No address associated', err, re.I):
        return 'quebrado'
    if hostile:
        return 'nao-verificavel'
    return 'instavel'


def collect():
    """{url: set(arquivos)} dos links http(s) citados nas páginas e nos cadastros."""
    urls = defaultdict(set)
    rx = re.compile(r'href="(https?://[^"#\s]+)')
    for p in sorted(ROOT.glob('*.html')):
        for u in rx.findall(read(p)):
            urls[u.replace('&amp;', '&')].add(p.name)
    import json
    for name, key in (('registry/precedentes.json', 'fonte'),):
        path = ROOT / name
        if path.exists():
            for cid, e in json.loads(read(path))['entries'].items():
                if e.get(key):
                    urls[e[key]].add('registry (%s)' % cid)
    leis = ROOT / 'registry' / 'leis.json'
    if leis.exists():
        for l in json.loads(read(leis))['leis']:
            urls[l['url']].add('registry/leis.json (%s)' % l['id'])
    return {u: f for u, f in urls.items() if urlparse(u).hostname not in SKIP_HOSTS}


def check_one(url):
    host = urlparse(url).hostname or ''
    with _lock:                                   # no máximo 1 pedido por segundo por site
        now = time.time()
        slot = max(now, _last[host] + 1.0)
        _last[host] = slot
    if slot > now:
        time.sleep(slot - now)
    status, final, head, err = probe(url, timeout=25, retries=1)
    return url, classify(status, err, host, head), status, err, final


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--host')
    a = ap.parse_args()
    urls = collect()
    items = sorted(urls)
    if a.host:
        items = [u for u in items if a.host in (urlparse(u).hostname or '')]
    if a.limit:
        items = items[:a.limit]
    print('Verificando %d endereços únicos (%d páginas/cadastros)...' % (len(items), len({f for u in items for f in urls[u]})), flush=True)
    res = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        for url, cls, status, err, final in ex.map(check_one, items):
            res[url] = (cls, status, err, final)
    groups = defaultdict(list)
    for u, (cls, st, err, final) in res.items():
        groups[cls].append((u, st, err, final))
    L = ['# Verificação dos links das fontes (%s)' % datetime.date.today().isoformat(), '',
         '%d endereços: %s.' % (len(res), ', '.join('%d %s' % (len(groups[k]), k) for k in ('ok', 'quebrado', 'suspeito', 'instavel', 'nao-verificavel') if groups[k])), '']
    titulos = {'quebrado': 'Quebrados (corrigir ou remover)', 'suspeito': 'Suspeitos (abre, mas a página diz que não existe)',
               'instavel': 'Instáveis (tentar de novo; pode ser o servidor)', 'nao-verificavel': 'Não verificáveis (o site bloqueia robôs; confira à mão se importar)'}
    for k in ('quebrado', 'suspeito', 'instavel', 'nao-verificavel'):
        if not groups[k]:
            continue
        L.append('## %s' % titulos[k])
        for u, st, err, final in sorted(groups[k]):
            L.append('- %s: %s%s' % (u, ('HTTP %d' % st) if st else (err or 'sem resposta'), ' → usada em: ' + ', '.join(sorted(urls[u])[:4]) + (' ...' if len(urls[u]) > 4 else '')))
        L.append('')
    out = '\n'.join(L)
    print(out)
    if a.report:
        (ROOT / a.report).write_text(out + '\n', encoding='utf-8', newline='\n')
    sys.exit(2 if groups['quebrado'] or groups['suspeito'] else 0)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    main()
