#!/usr/bin/env python3
"""
Cadastra no registro (registry/precedentes.json) as súmulas e súmulas vinculantes do STF citadas no site,
lendo o enunciado e o status na página OFICIAL do STF.

Uso:   python tools/registry_sync.py            (precisa de rede; rode depois de python tools/build.py)
       python tools/registry_sync.py --ids STF-S-523,STF-SV-14

Regras (zero invenção):
  - só entra o que foi lido na página oficial; o texto do enunciado é copiado literalmente;
  - status vem da listagem oficial: "(cancelada)" ou "(superada)" ao lado do número; sem marca = vigente;
  - se a página de jurisprudência selecionada do próprio STF diz que a súmula "não mais prevalece" ou fala em
    superação, isso vai para "observacao" (o status continua o da listagem; a pessoa confere antes de citar);
  - STJ, TST e Jurisprudência em Teses NÃO são lidos aqui (os sites não permitem leitura automática confiável):
    ficam como "não verificado" no site, e podem ser cadastrados à mão em registry/precedentes.json.
"""
import argparse
import datetime
import json
import re
import sys
import time

from common import ROOT, fetch, read, strip_tags

BASE = 'https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp?base=%d'
STOP = ('Tese de Repercussão Geral', 'Jurisprudência selecionada', 'Precedente Representativo', 'Precedentes Representativos',
        'Legislação', 'Observação', 'Data de Aprovação', 'Fonte de Publicação', 'Referência Legislativa', 'Doutrina',
        'Veja também', 'Súmulas Relacionadas', 'Notícias')


def listing(base):
    """{número: (id interno, status)} da listagem oficial."""
    st, body, err = fetch(BASE % base, timeout=60, retries=2)
    if not body:
        raise SystemExit('Não foi possível ler a listagem do STF (%s %s).' % (st, err))
    out = {}
    pat = re.compile(r'sumariosumulas\.asp\?base=%d&(?:amp;)?sumula=(\d+)[^>]*>\s*(.*?)</a>' % base, re.S)
    for iid, label in pat.findall(body):
        text = strip_tags(label.replace('&nbsp;', ' '))
        m = re.search(r'(\d+)', text)
        if not m:
            continue
        status = 'vigente'
        if re.search(r'cancelad', text, re.I):
            status = 'cancelada'
        elif re.search(r'superad', text, re.I):
            status = 'superada'
        out[int(m.group(1))] = (iid, status)
    # a listagem às vezes coloca a marca fora do <a>: "Súmula 4 (cancelada)"
    flat = strip_tags(body)
    for num, tag in re.findall(r'S[úu]mula(?:\s+Vinculante)?\s+(\d+)\s*\((cancelada|superada)\)', flat, re.I):
        if int(num) in out:
            out[int(num)] = (out[int(num)][0], 'cancelada' if tag.lower() == 'cancelada' else 'superada')
    return out


def enunciado(text, label_regex):
    m = re.search(label_regex, text)
    if not m:
        return None
    rest = text[m.end():]
    end = len(rest)
    for s in STOP:
        i = rest.find(s)
        if 0 <= i < end:
            end = i
    out = re.sub(r'\s+', ' ', rest[:end]).strip()
    return out or None


def sync(wanted):
    today = datetime.date.today().isoformat()
    lists = {'S': listing(30), 'SV': listing(26)}
    path = ROOT / 'registry' / 'precedentes.json'
    reg = json.loads(read(path)) if path.exists() else {'entries': {}}
    ents = reg.setdefault('entries', {})
    ok, skipped = [], []
    for cid in wanted:
        trib, tipo, num = cid.split('-')
        num = int(num)
        if trib != 'STF' or tipo not in lists:
            skipped.append((cid, 'fora do alcance desta ferramenta (só STF súmula/vinculante)'))
            continue
        base = 30 if tipo == 'S' else 26
        if num not in lists[tipo]:
            skipped.append((cid, 'não consta na listagem oficial'))
            continue
        iid, status = lists[tipo][num]
        url = BASE % base + '&sumula=' + iid
        st, body, err = fetch(url, timeout=60, retries=2)
        time.sleep(1.0)
        if not body:
            skipped.append((cid, 'falha ao ler a página (%s %s)' % (st, err)))
            continue
        text = strip_tags(body)
        label = r'Súmula Vinculante\s+%d\b' % num if tipo == 'SV' else r'Aplicação das Súmulas no STF\s+Súmula\s+%d\b' % num
        enun = enunciado(text, label)
        if not enun or len(enun) < 20:
            skipped.append((cid, 'enunciado não localizado na página'))
            continue
        e = {'status': status, 'enunciado': enun, 'fonte': url, 'verificadoEm': today}
        tail = text[text.find(enun) + len(enun):][:6000] if enun in text else ''
        if re.search(r'n[ãa]o\s+mais\s+prevalece|supera[çc][ãa]o\s+da\s+s[úu]mula\s+\d+|s[úu]mula\s+\d+(?:/STF)?\s+(?:foi|restou|est[áa])\s+superada', tail, re.I) and status == 'vigente':
            e['observacao'] = ('A própria página oficial do STF traz jurisprudência selecionada sobre superação desta súmula '
                               '(ex.: "não mais prevalece"). Confira antes de citar.')
        old = ents.get(cid, {})
        if old.get('status') != 'nao-verificado' and old.get('enunciado') and old.get('enunciado') != enun:
            print('ATENÇÃO: o enunciado de %s mudou em relação ao registro (mantendo o novo, conferir).' % cid)
        ents[cid] = e
        ok.append(cid)
    reg['_aviso'] = ('Registro único de precedentes. Cada entrada verificada precisa de enunciado, fonte (https) e verificadoEm. '
                     'Entradas do STF são gravadas por tools/registry_sync.py a partir da página oficial; as demais podem ser '
                     'cadastradas à mão. status: vigente | cancelada | superada | alterada | nao-verificado.')
    reg['entries'] = dict(sorted(ents.items(), key=lambda kv: (kv[0].split('-')[0], kv[0].split('-')[1], int(kv[0].split('-')[2]))))
    path.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    return ok, skipped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ids', help='lista separada por vírgula (ex.: STF-S-523,STF-SV-14); padrão: todos os do STF citados no site')
    args = ap.parse_args()
    if args.ids:
        wanted = [x.strip() for x in args.ids.split(',') if x.strip()]
    else:
        cit = json.loads(read(ROOT / 'citations.json'))['entries']
        wanted = [c for c in cit if c.startswith('STF-')]
    ok, skipped = sync(wanted)
    print('cadastrados/atualizados: %d' % len(ok))
    for cid in ok:
        print('  ok', cid)
    for cid, why in skipped:
        print('  NÃO: %s: %s' % (cid, why))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    main()
