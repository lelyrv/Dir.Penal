"""Funções compartilhadas pelas ferramentas (somente biblioteca padrão do Python 3)."""
import html
import re
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/120.0 Safari/537.36')


def read(path):
    return Path(path).read_text(encoding='utf-8').replace('\r\n', '\n')


def strip_tags(s):
    s = re.sub(r'<(script|style)\b.*?</\1>', '', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def fetch(url, timeout=30, retries=2, binary=False, method='GET', pause=1.5):
    """Baixa uma URL com cabeçalhos de navegador. Retorna (status, corpo|None, erro|None).
    Não levanta exceção: falhas de rede viram (0, None, 'mensagem'). Tenta de novo em erro de rede e 5xx."""
    last = (0, None, 'sem tentativa')
    for i in range(retries + 1):
        req = urllib.request.Request(url, method=method, headers={
            'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9', 'Connection': 'close'})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read() if method != 'HEAD' else b''
                charset = r.headers.get_content_charset() or ''
                return (r.status, body if binary else _decode(body, charset), None)
        except urllib.error.HTTPError as e:
            if e.code < 500:
                return (e.code, None, 'HTTP %d' % e.code)
            last = (e.code, None, 'HTTP %d' % e.code)
        except (urllib.error.URLError, socket.timeout, ConnectionError, OSError) as e:
            last = (0, None, '%s: %s' % (type(e).__name__, str(getattr(e, 'reason', e))[:80]))
        if i < retries:
            time.sleep(pause * (i + 1))
    return last


def _decode(body, charset):
    for enc in ([charset] if charset else []) + ['utf-8', 'cp1252']:
        try:
            return body.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return body.decode('latin-1', errors='replace')


def probe(url, timeout=25, retries=1, pause=2.0):
    """Abre a URL e lê só o início (4 KB). Retorna (status, url_final, inicio_do_corpo, erro|None). Não levanta exceção."""
    last = (0, url, '', 'sem tentativa')
    for i in range(retries + 1):
        req = urllib.request.Request(url, headers={
            'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9', 'Connection': 'close'})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                head = r.read(4096)
                return (r.status, r.geturl(), _decode(head, r.headers.get_content_charset() or ''), None)
        except urllib.error.HTTPError as e:
            if e.code < 500:
                return (e.code, url, '', 'HTTP %d' % e.code)
            last = (e.code, url, '', 'HTTP %d' % e.code)
        except (urllib.error.URLError, socket.timeout, ConnectionError, OSError) as e:
            last = (0, url, '', '%s: %s' % (type(e).__name__, str(getattr(e, 'reason', e))[:80]))
        if i < retries:
            time.sleep(pause)
    return last
