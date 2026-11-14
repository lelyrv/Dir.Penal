/**
 * Biblioteca dos testes de navegador (Node 18+, sem dependências).
 * Sobe um servidor estático local, abre o Chrome/Edge sem interface e o controla pelo protocolo DevTools.
 *
 * Navegador: variável BROWSER (caminho do executável) ou detecção automática
 * (Edge/Chrome no Windows; google-chrome, chromium no Linux/macOS).
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

export function findBrowser() {
  const c = [
    process.env.BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  const hit = c.find((p) => fs.existsSync(p));
  if (!hit) throw new Error('Nenhum Chrome/Edge encontrado. Defina a variável BROWSER com o caminho do executável.');
  return hit;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

/** Servidor estático. `virtual` mapeia caminhos que "existem" só no teste para outro arquivo real. */
export async function startServer() {
  const virtual = new Map();
  const hits = [];
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
    hits.push(req.method + ' ' + rel);
    const real = virtual.get(rel) || rel;
    const p = path.join(ROOT, real);
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (e, d) => {
      if (e) { res.writeHead(404); return res.end('nf'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(req.method === 'HEAD' ? undefined : d);
    });
  });
  const port = await freePort();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${port}/`, virtual, hits, close: () => new Promise((r) => server.close(r)), server };
}

export async function launchBrowser() {
  const exe = findBrowser();
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-test-'));
  const args = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run',
    '--disable-gpu', '--no-sandbox', '--disable-extensions', '--window-size=1280,900', 'about:blank'];
  const proc = spawn(exe, args, { stdio: 'ignore' });
  const dbg = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(dbg + '/json/version'); if (r.ok) break; } catch { /* aguardando */ }
    await sleep(150);
  }
  return {
    dbg, proc, profile,
    async newPage() {
      let target;
      for (let i = 0; i < 50 && !target; i++) {
        try {
          const l = await (await fetch(dbg + '/json/list')).json();
          target = l.find((x) => x.type === 'page');
        } catch { /* aguardando */ }
        if (!target) await sleep(150);
      }
      return Page.attach(target);
    },
    async openTab(url = 'about:blank') {
      const t = await (await fetch(`${dbg}/json/new?${url}`, { method: 'PUT' })).json();
      return Page.attach(t, { id: t.id, dbg });
    },
    async close() {
      try { proc.kill(); } catch { /* já encerrado */ }
      await sleep(300);
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* ignora */ }
    },
  };
}

export class Page {
  static async attach(target, extra = {}) {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const p = new Page(ws, extra);
    await p.send('Page.enable'); await p.send('Runtime.enable'); await p.send('Log.enable');
    await p.viewport(1280, 800, false);
    return p;
  }

  constructor(ws, extra) {
    this.ws = ws; this.extra = extra; this.id = 0; this.pend = new Map();
    this.errors = [];       // erros de JavaScript (exceções e console.error)
    this.netErrors = [];    // falhas de rede registradas no console (ex.: 404)
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pend.has(d.id)) { this.pend.get(d.id)(d); this.pend.delete(d.id); }
      else if (d.method === 'Runtime.exceptionThrown') this.errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
      else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') this.errors.push('console.error ' + JSON.stringify(d.params.args.map((a) => a.value)));
      else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') this.netErrors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''));
    };
  }

  send(method, params = {}) {
    return new Promise((r) => { const i = ++this.id; this.pend.set(i, r); this.ws.send(JSON.stringify({ id: i, method, params })); });
  }
  viewport(w, h = 800, mobile = false) {
    return this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  }
  async ev(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  }
  async go(url, { wait = 300 } = {}) {
    this.errors.length = 0; this.netErrors.length = 0;
    await this.send('Page.navigate', { url });
    await sleep(150);
    for (let k = 0; k < 80 && (await this.ev('document.readyState')) !== 'complete'; k++) await sleep(150);
    await sleep(wait);
  }
  click(sel) { return this.ev(`document.querySelector(${JSON.stringify(sel)}).click(),true`); }
  async key(k, code, vk) {
    for (const type of ['keyDown', 'keyUp']) {
      await this.send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, text: k === 'Enter' ? '\r' : undefined });
    }
    await sleep(120);
  }
  tab() { return this.key('Tab', 'Tab', 9); }
  async ctrlK() {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 2 });
    await sleep(200);
  }
  async type(text) { await this.send('Input.insertText', { text }); await sleep(250); }
  async shot(file) {
    const r = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  }
  // ── auxiliares da barra de estudo ──
  async ui() {
    return JSON.parse(await this.ev(`JSON.stringify({timer:document.getElementById('vm-timer').textContent,status:document.getElementById('vm-status').textContent,pause:document.getElementById('vm-pause-timer').textContent,start:document.getElementById('vm-btn-start').textContent.trim(),startDis:document.getElementById('vm-btn-start').disabled,pauseDis:document.getElementById('vm-btn-pause').disabled,endDis:document.getElementById('vm-btn-end').disabled})`));
  }
  toast() { return this.ev(`(()=>{const t=document.getElementById('vm-toast');return t&&t.style.display!=='none'?t.textContent:null})()`); }
  ls(k) { return this.ev(`localStorage.getItem(${JSON.stringify(k)})`); }
  async sessions() { return JSON.parse((await this.ls('vadeMecum_studySessions')) || '[]'); }
  async active() { return JSON.parse((await this.ls('vadeMecum_activeSession')) || 'null'); }

  /** Congela o "agora" do navegador numa data (continua andando). Vale para as próximas páginas carregadas. */
  async freezeDate(iso) {
    const target = Date.parse(iso);
    const src = `(()=>{const R=Date,delta=${target}-R.now();class D extends R{constructor(...a){if(a.length===0){super(R.now()+delta);}else{super(...a);}}static now(){return R.now()+delta;}}window.Date=D;})();`;
    const r = await this.send('Page.addScriptToEvaluateOnNewDocument', { source: src });
    return r.result.identifier;
  }
  /** Grava no localStorage da origem atual. */
  setLS(obj) { return this.ev(`(()=>{const o=${JSON.stringify(obj)};for(const k in o)localStorage.setItem(k,typeof o[k]==='string'?o[k]:JSON.stringify(o[k]));return true})()`); }
  getLS(k) { return this.ev(`localStorage.getItem(${JSON.stringify(k)})`).then((v) => { try { return JSON.parse(v); } catch { return v; } }); }
  close() { try { this.ws.close(); } catch { /* ignora */ } }
}

/** Relatório simples de checagens; process.exitCode = 1 se alguma falhar. */
export function suite(name) {
  const s = { name, pass: 0, fail: 0, lines: [] };
  console.log(`\n### ${name}`);
  s.check = (n, ok, detail = '') => {
    ok ? s.pass++ : s.fail++;
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + n + (detail ? '  -> ' + String(detail).slice(0, 400) : ''));
    return ok;
  };
  s.done = () => {
    console.log(`RESULTADO ${name}: ${s.pass} PASS / ${s.fail} FAIL`);
    if (s.fail) process.exitCode = 1;
    return s;
  };
  return s;
}

/** Executa um teste com servidor + navegador e encerra tudo no fim, mesmo em caso de erro. */
export async function run(fn) {
  const server = await startServer();
  const browser = await launchBrowser();
  try { await fn({ base: server.base, server, browser }); }
  catch (e) { console.error('ERRO NO TESTE:', e); process.exitCode = 1; }
  finally { await browser.close(); await server.close(); }
  process.exit(process.exitCode || 0);
}

export function articleFiles() {
  return fs.readdirSync(ROOT).filter((f) => /-ART-\d+\.html$/.test(f) && fs.readFileSync(path.join(ROOT, f), 'utf8').includes('VM-STUDY-BAR-START')).sort();
}
export const secs = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
