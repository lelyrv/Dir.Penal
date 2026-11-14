#!/usr/bin/env python3
"""
Baixa as fontes do Google Fonts (licença OFL, permite hospedar) para a pasta fonts/ e gera fonts.css.
Só o subconjunto "latin" (cobre todo o português). Rodar uma vez, ou de novo se uma página passar
a usar outra família:   python tools/fetch_fonts.py

As URLs abaixo são as que as páginas usavam antes do modo offline.
"""
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
G = 'https://fonts.googleapis.com/css2?family='
URLS = [
    G + 'Playfair+Display:ital,wght@0,400;0,600;0,700;0,900;1,600&family=Source+Serif+4:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=JetBrains+Mono:wght@400;600&display=swap',
    G + 'Spectral:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400&family=Cinzel:wght@400;600;700&display=swap',
    G + 'Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400;0,500;0,700;1,400;1,500&display=swap',
    G + 'Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,700;0,9..144,900;1,9..144,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300&display=swap',
    G + 'Cormorant+SC:wght@400;600;700&family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&display=swap',
    G + 'Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&display=swap',
]


def get(url, binary=False):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode('utf-8')


def main():
    out_dir = ROOT / 'fonts'
    out_dir.mkdir(exist_ok=True)
    faces = {}      # (familia, estilo, peso) -> (url, unicode-range)
    for u in URLS:
        css = get(u)
        for m in re.finditer(r'/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}', css, re.S):
            if m.group(1) != 'latin':
                continue
            body = m.group(2)
            fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
            sty = re.search(r'font-style:\s*(\w+)', body).group(1)
            wgt = re.search(r'font-weight:\s*([\d ]+)', body).group(1).strip()
            src = re.search(r'url\((https://[^)]+\.woff2)\)', body).group(1)
            rng = re.search(r'unicode-range:\s*([^;]+);', body).group(1).strip()
            faces[(fam, sty, wgt)] = (src, rng)
    files = {}      # url -> nome local
    css_out = ['/* Fontes locais (OFL). Gerado por tools/fetch_fonts.py. Só o subconjunto latin. */']
    total = 0
    for (fam, sty, wgt), (src, rng) in sorted(faces.items()):
        if src not in files:
            name = '%s-%s-%s.woff2' % (re.sub(r'[^a-z0-9]+', '-', fam.lower()).strip('-'), sty, wgt.replace(' ', '_'))
            data = get(src, binary=True)
            (out_dir / name).write_bytes(data)
            files[src] = name
            total += len(data)
        css_out.append("@font-face{font-family:'%s';font-style:%s;font-weight:%s;font-display:swap;"
                       "src:url(fonts/%s) format('woff2');unicode-range:%s;}" % (fam, sty, wgt, files[src], rng))
    (ROOT / 'fonts.css').write_text('\n'.join(css_out) + '\n', encoding='utf-8', newline='\n')
    fams = sorted({k[0] for k in faces})
    print('%d famílias: %s' % (len(fams), ', '.join(fams)))
    print('%d declarações, %d arquivos, %d KB' % (len(faces), len(files), total // 1024))


if __name__ == '__main__':
    sys.exit(main())
