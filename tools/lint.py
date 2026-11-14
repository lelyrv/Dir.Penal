"""
Verificação de padrão dos artigos publicados (usada pelo build.py).

Regras (código → o que exige):
  data       data de última conferência reconhecível no topo ou rodapé da página
  recorr     seção de "pontos recorrentes" (.prova-section) com pelo menos 10 itens
  emoji      nenhum emoji no conteúdo (a barra de estudo não conta)
  fontes     seção de fontes (id="fontes"; no padrão atual, antes do rodapé)
  textolegal seção do texto legal (id="texto-legal")
  marcador   nenhum marcador de preenchimento "[[...]]" esquecido
  h1         exatamente um <h1>

Páginas antigas (DP, CC, CLT) violam algumas regras desde antes: ficam registradas em
tools/lint-baseline.json e viram AVISO. Qualquer violação NOVA, ou em página nova, FALHA o build.
Para reconhecer um estado atual como baseline:  python tools/build.py --update-baseline
"""
import json
import re

from common import ROOT, read, strip_tags

RULES = {
    'data': 'sem data de última conferência reconhecível',
    'recorr': 'sem seção de pontos recorrentes com ao menos 10 itens',
    'emoji': 'contém emoji',
    'fontes': 'sem seção de fontes (id="fontes")',
    'textolegal': 'sem seção do texto legal (id="texto-legal")',
    'marcador': 'tem marcador de preenchimento [[...]] esquecido',
    'h1': 'não tem exatamente um <h1>',
}

EMOJI_RE = re.compile('[\U0001F000-\U0001FAFF☀-⛿✅❌❎❓-❕❗⭐⭕️‍]')
BASELINE = ROOT / 'tools' / 'lint-baseline.json'


def violations(path, info):
    """Códigos das regras violadas por uma página disponível. `info` vem do scan do build."""
    t = read(path)
    body = t[t.find('<body'):]
    body = re.sub(r'<!-- VM-STUDY-BAR-START -->.*?<!-- VM-STUDY-BAR-END -->', '', body, flags=re.S)
    body = re.sub(r'<!-- VM-RUNTIME -->.*?<!-- /VM-RUNTIME -->', '', body, flags=re.S)
    visible = re.sub(r'<(script|style)\b.*?</\1>', '', body, flags=re.S)
    out = []
    if not info.get('checked'):
        out.append('data')
    n_items = len(re.findall(r'class="prova-item"', body))
    if not re.search(r'class="prova-section"', body) or n_items < 10:
        out.append('recorr')
    if EMOJI_RE.search(strip_tags(visible)) or EMOJI_RE.search(re.sub(r'<[^>]+>', '', visible)):
        out.append('emoji')
    if 'id="fontes"' not in body:
        out.append('fontes')
    if 'id="texto-legal"' not in body:
        out.append('textolegal')
    if '[[' in strip_tags(visible):
        out.append('marcador')
    if len(re.findall(r'<h1[\s>]', body)) != 1:
        out.append('h1')
    return out


def load_baseline():
    if BASELINE.exists():
        return json.loads(BASELINE.read_text(encoding='utf-8'))
    return {}


def evaluate(found):
    """found: {arquivo: [regras]}. Retorna (problemas, avisos, resumo)."""
    base = load_baseline()
    problems, warns = [], []
    legacy = 0
    for f, rules in sorted(found.items()):
        known = set(base.get(f, []))
        new = [r for r in rules if r not in known]
        old = [r for r in rules if r in known]
        legacy += len(old)
        for r in new:
            problems.append('%s: %s [%s]' % (f, RULES[r], r))
    for f, rules in sorted(base.items()):
        gone = [r for r in rules if r not in found.get(f, [])]
        if gone:
            warns.append('baseline obsoleta em %s (já corrigido: %s); rode --update-baseline para limpar' % (f, ','.join(gone)))
    return problems, warns, {'legado': legacy, 'paginas_com_violacao': len([1 for r in found.values() if r])}


def write_baseline(found):
    data = {f: sorted(r) for f, r in sorted(found.items()) if r}
    BASELINE.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    return len(data)
