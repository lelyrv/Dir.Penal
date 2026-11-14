"""Testes das ferramentas em Python (biblioteca padrão). Rodar:  python -m unittest tools/test_tools.py -v
(também executado por tests/static.test.mjs)."""
import http.server
import json
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_sources  # noqa: E402
import common  # noqa: E402
import extras  # noqa: E402
import law_watch  # noqa: E402
import lint  # noqa: E402
import build  # noqa: E402

ROOT = common.ROOT


# ───────── servidor local de brincadeira ─────────
class _H(http.server.BaseHTTPRequestHandler):
    hits = {}

    def log_message(self, *a):
        pass

    def do_GET(self):
        _H.hits[self.path] = _H.hits.get(self.path, 0) + 1
        if self.path == '/ok':
            self._send(200, '<html><title>Lei</title>texto da lei</html>')
        elif self.path == '/soft':
            self._send(200, '<html><title>Erro</title><h1>Página não encontrada</h1></html>')
        elif self.path == '/gone':
            self._send(404, 'x')
        elif self.path == '/forbidden':
            self._send(403, 'x')
        elif self.path == '/boom':
            self._send(500, 'x')
        elif self.path == '/flaky':
            self._send(500 if _H.hits[self.path] == 1 else 200, 'ok')
        elif self.path == '/redir':
            self.send_response(302); self.send_header('Location', '/ok'); self.end_headers()
        elif self.path == '/slow':
            time.sleep(3); self._send(200, 'tarde')
        else:
            self._send(404, 'x')

    def _send(self, code, body):
        b = body.encode('utf-8')
        self.send_response(code); self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)


class Servidor:
    def __enter__(self):
        self.s = http.server.ThreadingHTTPServer(('127.0.0.1', 0), _H)
        self.base = 'http://127.0.0.1:%d' % self.s.server_address[1]
        threading.Thread(target=self.s.serve_forever, daemon=True).start()
        _H.hits = {}
        return self

    def __exit__(self, *a):
        self.s.shutdown()


class TestLinks(unittest.TestCase):
    def test_classify(self):
        c = check_sources.classify
        self.assertEqual(c(200, None, 'www.planalto.gov.br', 'texto'), 'ok')
        self.assertEqual(c(301, None, 'x.gov.br', ''), 'ok')
        self.assertEqual(c(404, 'HTTP 404', 'www.planalto.gov.br', ''), 'quebrado')
        self.assertEqual(c(410, 'HTTP 410', 'portal.stf.jus.br', ''), 'quebrado')
        self.assertEqual(c(404, 'HTTP 404', 'www.stj.jus.br', ''), 'nao-verificavel')   # site que bloqueia robôs
        self.assertEqual(c(403, 'HTTP 403', 'portal.stf.jus.br', ''), 'nao-verificavel')
        self.assertEqual(c(429, 'HTTP 429', 'qualquer.com', ''), 'nao-verificavel')
        self.assertEqual(c(200, None, 'x.com', '<h1>Página não encontrada</h1>'), 'suspeito')
        self.assertEqual(c(200, None, 'x.com', '<title>404 - Not found</title>'), 'suspeito')
        self.assertEqual(c(500, 'HTTP 500', 'x.com', ''), 'instavel')
        self.assertEqual(c(0, 'TimeoutError: timed out', 'x.com', ''), 'instavel')
        self.assertEqual(c(0, 'URLError: [Errno 11001] getaddrinfo failed', 'x.com', ''), 'quebrado')
        self.assertEqual(c(0, 'URLError: timed out', 'scon.stj.jus.br', ''), 'nao-verificavel')

    def test_probe_contra_servidor_local(self):
        with Servidor() as s:
            self.assertEqual(common.probe(s.base + '/ok')[0], 200)
            self.assertEqual(common.probe(s.base + '/gone')[0], 404)
            self.assertEqual(common.probe(s.base + '/forbidden')[0], 403)
            st, final, head, err = common.probe(s.base + '/redir')
            self.assertEqual((st, final.endswith('/ok')), (200, True))
            self.assertEqual(common.probe(s.base + '/flaky', retries=1, pause=0.1)[0], 200)   # 500 e depois 200: tenta de novo
            self.assertEqual(common.probe(s.base + '/boom', retries=1, pause=0.1)[0], 500)
            st, _, _, err = common.probe(s.base + '/slow', timeout=1, retries=0)
            self.assertEqual(st, 0)
            self.assertIn('imeout', err + 'imeout')

    def test_check_one_ponta_a_ponta(self):
        with Servidor() as s:
            self.assertEqual(check_sources.check_one(s.base + '/ok')[1], 'ok')
            self.assertEqual(check_sources.check_one(s.base + '/gone')[1], 'quebrado')
            self.assertEqual(check_sources.check_one(s.base + '/soft')[1], 'suspeito')
            self.assertEqual(check_sources.check_one(s.base + '/forbidden')[1], 'nao-verificavel')


# ───────── padrão dos artigos ─────────
def _pagina(extra='', recorr=10, data='Conferência normativa em 12/11/2026', fontes=True, texto=True, h1=1):
    itens = ''.join('<div class="prova-item"><div class="prova-item-q">P</div><div class="prova-item-a">R</div></div>' for _ in range(recorr))
    return ('<html><body><header id="hero">%s%s<div class="badge">%s</div></header><div class="page-wrap">'
            '%s<section class="prova-section" id="recorrentes">%s</section>%s</div></body></html>'
            % ('<h1>T</h1>' * h1, extra, data,
               '<section class="section" id="texto-legal">x</section>' if texto else '', itens,
               '<section class="section" id="fontes">f</section>' if fontes else ''))


class TestLint(unittest.TestCase):
    def v(self, html, checked='2026-11-12'):
        with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
            f.write(html)
        try:
            return set(lint.violations(f.name, {'checked': checked}))
        finally:
            Path(f.name).unlink()

    def test_pagina_correta(self):
        self.assertEqual(self.v(_pagina()), set())

    def test_cada_regra(self):
        self.assertEqual(self.v(_pagina(), checked=None), {'data'})
        self.assertEqual(self.v(_pagina(recorr=9)), {'recorr'})
        self.assertEqual(self.v(_pagina(extra='<p>Atenção ⚡</p>')), {'emoji'})
        self.assertEqual(self.v(_pagina(extra='<p>ok ✅</p>')), {'emoji'})
        self.assertEqual(self.v(_pagina(fontes=False)), {'fontes'})
        self.assertEqual(self.v(_pagina(texto=False)), {'textolegal'})
        self.assertEqual(self.v(_pagina(extra='<p>[[PREENCHER]]</p>')), {'marcador'})
        self.assertEqual(self.v(_pagina(h1=2)), {'h1'})

    def test_simbolos_normais_nao_sao_emoji(self):
        self.assertEqual(self.v(_pagina(extra='<p>§ 1º — “aspas” → ✓ ×</p>')), set())

    def test_baseline_so_barra_violacao_nova(self):
        old = lint.BASELINE
        with tempfile.TemporaryDirectory() as d:
            lint.BASELINE = Path(d) / 'b.json'
            lint.BASELINE.write_text(json.dumps({'velha.html': ['emoji']}))
            probs, warns, _ = lint.evaluate({'velha.html': ['emoji'], 'nova.html': ['emoji']})
            self.assertEqual(len(probs), 1)
            self.assertIn('nova.html', probs[0])                                   # só a página nova falha
            probs, warns, _ = lint.evaluate({'velha.html': ['emoji', 'fontes']})   # regressão na página velha: nova regra
            self.assertEqual(len(probs), 1)
            probs, warns, _ = lint.evaluate({'velha.html': []})
            self.assertEqual((probs, len(warns)), ([], 1))                         # corrigida: avisa para limpar a baseline
        lint.BASELINE = old


# ───────── leis no Planalto ─────────
HTML_LEI = ('<p>Art. 9 - Texto nove.</p><p>Art. 10 - O dia do começo inclui-se.</p><p>Frações não computáveis da pena (Redação dada pela Lei X)</p>'
            '<p><s>Art. 11 - revogado tachado</s></p><p>Art. 12 - Doze (cuja redação cita o Art. 5º no meio).</p>'
            '<p>Art. 75 - Setenta e cinco.</p><p>Art. 75-A. Com letra.</p>'
            '<p>Art. \n115. São reduzidos de metade.</p><p>§ 1º Algo.</p>')


class TestLaw(unittest.TestCase):
    def test_parse(self):
        a = law_watch.parse_articles(HTML_LEI)
        self.assertEqual(a['10'], 'Art. 10 - O dia do começo inclui-se.')       # "O" da frase não vira "10-O"; título do próximo sai
        self.assertIn('115', a)                                                 # "Art. ⏎ 115." do código-fonte
        self.assertTrue(a['115'].startswith('Art. 115. São reduzidos'))
        self.assertIn('§ 1º Algo.', a['115'])
        self.assertIn('75-A', a)                                                # sufixo de letra colado ao número
        self.assertEqual(a['75'], 'Art. 75 - Setenta e cinco.')
        mil = law_watch.parse_articles('<p>Art. 999. Novecentos.</p><p>Art. 1.000. Mil.</p><p>Art. 1.001. Mil e um.</p>')
        self.assertEqual(sorted(mil), ['1000', '1001', '999'])                  # "1.000" com ponto de milhar
        self.assertNotIn('11', a)                                             # tachado (revogado) não entra
        self.assertEqual(a['12'], 'Art. 12 - Doze (cuja redação cita o Art. 5º no meio).')   # "Art. 5º" no meio da linha não abre artigo
        self.assertNotIn('5', a)

    def _check(self, fake_arts, snap_arts):
        snap = {'id': 'X', 'total': len(snap_arts), 'lidoEm': '2026-01-01',
                'articles': {k: {'hash': law_watch.h(v), 'text': v} for k, v in snap_arts.items()}}
        saved = (law_watch.fetch_law, law_watch.load_snapshot, law_watch.laws, law_watch.tracked_pages)
        law_watch.fetch_law = lambda law: (fake_arts, None if fake_arts else 'indisponível (teste)')   # a real devolve (artigos, erro)
        law_watch.load_snapshot = lambda lid: snap
        law_watch.laws = lambda only=None: [{'id': 'X', 'nome': 'n', 'url': 'u', 'subject': 'ZZ'}]
        law_watch.tracked_pages = lambda s: {'5': 'ZZ-ART-5.html'}
        try:
            import io, contextlib
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = law_watch.cmd_check(None, None)
            return rc, buf.getvalue()
        finally:
            law_watch.fetch_law, law_watch.load_snapshot, law_watch.laws, law_watch.tracked_pages = saved

    def test_sem_mudanca(self):
        base = {str(i): 'Art. %d - texto %d' % (i, i) for i in range(1, 11)}
        rc, out = self._check(dict(base), base)
        self.assertEqual(rc, 0)

    def test_mudanca_e_sinal_de_pagina(self):
        base = {str(i): 'Art. %d - texto %d' % (i, i) for i in range(1, 11)}
        novo = dict(base); novo['5'] = 'Art. 5 - texto NOVO'; novo['11'] = 'Art. 11 - acrescentado'; del novo['9']
        rc, out = self._check(novo, base)
        self.assertEqual(rc, 2)
        self.assertIn('art. 5 alterado', out)
        self.assertIn('há página no site: ZZ-ART-5.html', out)
        self.assertIn('art. 11 acrescentado', out)
        self.assertIn('art. 9 ausente', out)

    def test_planalto_fora_do_ar_nao_e_mudanca(self):
        base = {str(i): 'Art. %d - texto' % i for i in range(1, 11)}
        rc, out = self._check(None, base)
        self.assertEqual(rc, 3)
        self.assertIn('NÃO indica mudança', out)
        rc, out = self._check({'1': 'Art. 1 - só um'}, base)        # página incompleta (1 de 10 artigos) também não é mudança
        self.assertEqual(rc, 3)

    def test_squash_ignora_anotacoes(self):
        a = law_watch.squash('Art. 65 - Os atos “valem”. (Redação dada pela Lei nº 1, de 2000)')
        self.assertEqual(a, 'os atos valem')


# ───────── citações, registro, fila ─────────
class TestExtras(unittest.TestCase):
    def setUp(self):
        self.pats, _ = extras.load_patterns()

    def test_citacoes(self):
        f = extras.find_citations('Súmula 523/STF, SV 14 e Súmula Vinculante 35; Súmula 243 do STJ; JT 69; Jurisprudência em Teses 93; Súmula 523 / STF.', self.pats)
        self.assertEqual(f, {'STF-S-523': 2, 'STF-SV-14': 1, 'STF-SV-35': 1, 'STJ-S-243': 1, 'STJ-JT-69': 1, 'STJ-JT-93': 1})

    def test_sem_tribunal_nao_inventa(self):
        self.assertEqual(extras.find_citations('conforme a Súmula 523 e o enunciado 9', self.pats), {})

    def test_registro_valida(self):
        probs = []
        saved = extras.read
        extras.read = lambda p: json.dumps({'entries': {
            'STF-S-1': {'status': 'vigente', 'enunciado': 'x', 'fonte': 'https://a.b', 'verificadoEm': '2026-01-01'},
            'STF-S-2': {'status': 'vigente', 'enunciado': 'x'},                                  # falta fonte e data
            'STF-S-3': {'status': 'inventado'}, 'XX-1': {'status': 'vigente'},
            'STJ-S-4': {'status': 'nao-verificado'},
            'STF-S-5': {'status': 'vigente', 'enunciado': 'x', 'fonte': 'http://a.b', 'verificadoEm': '01/01/2026'}}})
        try:
            extras.load_registry(probs)
        finally:
            extras.read = saved
        txt = '\n'.join(probs)
        self.assertIn('STF-S-2: "fonte" é obrigatório', txt)
        self.assertIn('STF-S-2: "verificadoEm" é obrigatório', txt)
        self.assertIn('STF-S-3: status inválido', txt)
        self.assertIn('id inválido: XX-1', txt)
        self.assertIn('STF-S-5: fonte deve ser um endereço https://', txt)
        self.assertIn('STF-S-5: verificadoEm deve ser AAAA-MM-DD', txt)
        self.assertNotIn('STF-S-1', txt)
        self.assertNotIn('STJ-S-4', txt)

    def test_registro_real_valido(self):
        probs = []
        extras.load_registry(probs)
        self.assertEqual(probs, [])

    def test_fila(self):
        def art(label, num, av=False, text=''):
            return {'subject': 'L', 'label': label, 'num': num, 'available': av, 'status': 'disponivel' if av else 'em-breve', '_sc': {'sections': [{'text': text}]}}
        arts = {'A.html': art('Art. 1', '1', True, 'O art. 3 é citado. Veja o art. 3 desta Lei e o art. 3 do CPP e o art. 4 do CP e o artigo 4.'),
                'B.html': art('Art. 2', '2'), 'C.html': art('Art. 3', '3'), 'D.html': art('Art. 4', '4'), 'E.html': art('Art. 5', '5')}
        q = extras.build_queue(arts, list(arts), {'E.html': {'peso': 5, 'nota': 'urgente'}})
        self.assertEqual([x['file'] for x in q], ['E.html', 'C.html', 'D.html', 'B.html'])   # peso manda; depois citações (C=2, D=1); depois ordem
        self.assertEqual(next(x for x in q if x['file'] == 'C.html')['mentions'], 2)           # "do CPP" não conta
        self.assertEqual(next(x for x in q if x['file'] == 'D.html')['mentions'], 1)           # "art. 4 do CP" fica de fora; "artigo 4" conta

    def test_cartoes(self):
        with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
            f.write(_pagina().replace('<div class="prova-item">', '<div class="prova-group">Grupo A</div><div class="prova-item"><div class="prova-item-q"><span class="qnum">07</span>Quando?</div><div class="prova-item-a">Sempre. <span class="ref">Art. 1</span></div></div><div class="prova-item">', 1))
        try:
            c = extras.training_cards(f.name, 'X-ART-1.html', 'X')
        finally:
            Path(f.name).unlink()
        self.assertEqual((c[0]['id'], c[0]['group'], c[0]['q'], c[0]['a'], c[0]['ref']), ('X-ART-1.html#07', 'Grupo A', 'Quando?', 'Sempre. Art. 1', 'Art. 1'))


class TestBuildHelpers(unittest.TestCase):
    def test_datas_de_conferencia(self):
        e = build.extract_checked
        self.assertEqual(e('Atualização conferida em 03/05/2026')[:2], ('2026-05-03', 'dia'))
        self.assertEqual(e('x conferência normativa em 12/11/2026 y atualizado em 01/01/2020')[:2], ('2026-11-12', 'dia'))   # a mais recente
        self.assertEqual(e('Atualizado em Maio/2026')[:2], ('2026-05', 'mês'))
        self.assertEqual(e('atualizado até janeiro de 2026')[:2], ('2026-01', 'mês'))
        self.assertEqual(e('Material · Atualizado 2025')[:2], ('2025', 'ano'))
        self.assertEqual(e('Decreto-Lei 2.848/1940 · Redação de 11/07/1984'), (None, None, None))   # data de lei não é conferência


class TestNovoArtigo(unittest.TestCase):
    def test_esqueleto(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / 'L9099-ART-66.html'
            r = subprocess.run([sys.executable, str(ROOT / 'tools' / 'new_article.py'), '--subject', 'L9099', '--num', '66', '--title', 'Citação',
                                '--out', str(out), '--no-catalog'], capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
            t = out.read_text(encoding='utf-8')
            self.assertIn('data-article-id="L9099-ART-66"', t)
            self.assertIn('id="em-elaboracao"', t)
            self.assertIn('A citação será pessoal e far-se-á no próprio Juizado', t)   # texto literal do retrato
            self.assertGreater(t.count('[['), 20)
            self.assertEqual(t.count('class="prova-item"'), 10)
            self.assertNotIn('ART-65', t)
            r2 = subprocess.run([sys.executable, str(ROOT / 'tools' / 'new_article.py'), '--subject', 'L9099', '--num', '66', '--title', 'x',
                                 '--out', str(out), '--no-catalog'], capture_output=True, text=True, encoding='utf-8')
            self.assertNotEqual(r2.returncode, 0)                                       # não sobrescreve
            self.assertIn('Já existe', r2.stdout + r2.stderr)
            # com marcadores e sem "em-elaboracao", o padrão barra
            v = lint.violations(out, {'checked': None})
            self.assertIn('marcador', v)
            self.assertIn('data', v)


if __name__ == '__main__':
    unittest.main()
