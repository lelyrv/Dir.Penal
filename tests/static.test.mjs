// Verificações estáticas (sem navegador): arquivos gerados em dia, sintaxe dos scripts, JSON, service worker,
// fontes, ícones, noindex, robots.txt.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { suite, ROOT } from './lib.mjs';

const T = suite('Estático');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// 1) gerador em dia
let py = null;
for (const c of ['python3', 'python', 'py']) { const r = spawnSync(c, ['--version']); if (r.status === 0) { py = c; break; } }
if (py) {
  const r = spawnSync(py, ['tools/build.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
  T.check('tools/build.py --check: menus, manifesto, busca, sw.js e versões em dia, sem inconsistências', r.status === 0, (r.stdout + r.stderr).split('\n').filter((l) => /PROBLEMA|DESATUALIZADO|FALHOU/.test(l)).join(' | '));
} else {
  T.check('Python disponível para rodar tools/build.py --check', false, 'python não encontrado no PATH');
}

// 2) sintaxe JS
const jsFiles = [...fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')), ...fs.readdirSync(path.join(ROOT, 'tests')).map((f) => 'tests/' + f).filter((f) => f.endsWith('.mjs')), 'tools/sw.template.js']
  .filter((f) => !f.endsWith('sw.template.js'));
const badJs = jsFiles.filter((f) => spawnSync(process.execPath, ['--check', path.join(ROOT, f)]).status !== 0);
T.check(`Sintaxe de ${jsFiles.length} arquivos JavaScript`, badJs.length === 0, badJs.join(', '));

// 3) JSON
const badJson = [];
const JSONS = ['catalog.json', 'articles.json', 'citations.json', 'queue.json', 'training.json', 'manifest.webmanifest',
  'search-index-CP.json', 'search-index-CC.json', 'search-index-CLT.json', 'search-index-L9099.json',
  'registry/patterns.json', 'registry/precedentes.json', 'registry/leis.json', 'registry/prioridades.json',
  'data/laws/CP.json', 'data/laws/CC.json', 'data/laws/CLT.json', 'data/laws/L9099.json', 'data/laws/CPP.json', 'data/alteracoes.json', 'tools/lint-baseline.json'];
for (const f of JSONS) { try { JSON.parse(read(f)); } catch (e) { badJson.push(f); } }
T.check(`JSON válido: ${JSONS.length} arquivos (catálogo, manifesto, buscas por matéria, citações, treino, fila, registros, leis)`, badJson.length === 0, badJson.join(', '));

// 4) service worker: tudo que ele promete guardar existe
const sw = read('sw.js');
const critical = JSON.parse(sw.match(/const CRITICAL = (\[[\s\S]*?\]);/)[1]);
const pages = JSON.parse(sw.match(/const PAGES = (\[[\s\S]*?\]);/)[1]);
const missing = [...critical, ...pages].filter((u) => u !== './' && !fs.existsSync(path.join(ROOT, u.split('?')[0])));
T.check(`sw.js: os ${critical.length + pages.length} arquivos a guardar existem (senão a instalação falharia)`, missing.length === 0, missing.slice(0, 5).join(', '));
T.check('sw.js guarda o casco do site, os índices e todos os artigos publicados', critical.includes('index.html') && critical.includes('index-penal.html') && critical.some((u) => u.startsWith('search.js')) && pages.length > 40);

// 5) fontes e ícones
const css = read('fonts.css');
const fontFiles = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);
T.check(`fonts.css: ${fontFiles.length} arquivos de fonte, todos locais e existentes`, fontFiles.length > 20 && fontFiles.every((u) => !/^https?:/.test(u) && fs.existsSync(path.join(ROOT, u))));
const man = JSON.parse(read('manifest.webmanifest'));
T.check('Manifesto do app: ícones existem e há um "maskable"', man.icons.every((i) => fs.existsSync(path.join(ROOT, i.src))) && man.icons.some((i) => i.purpose === 'maskable') && man.start_url === 'index.html');

// 6) privacidade
const htmls = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const noRobots = htmls.filter((f) => !/<meta name="robots" content="noindex, nofollow">/.test(read(f)));
T.check(`noindex em todas as ${htmls.length} páginas HTML`, noRobots.length === 0, noRobots.join(', '));
T.check('robots.txt bloqueia a indexação', fs.existsSync(path.join(ROOT, 'robots.txt')) && /Disallow:\s*\//.test(read('robots.txt')));

// 7) catálogo e disco
const cat = JSON.parse(read('catalog.json'));
const onDisk = fs.readdirSync(ROOT).filter((f) => /-ART-\d+\.html$/.test(f));
const inCat = new Set(cat.subjects.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.file))));
T.check('Todo artigo em disco está no catálogo (nenhum "órfão" fora do menu)', onDisk.every((f) => inCat.has(f)), onDisk.filter((f) => !inCat.has(f)).join(', '));

// 8) testes das ferramentas em Python
if (py) {
  const r = spawnSync(py, ['-X', 'utf8', '-W', 'ignore', '-m', 'unittest', 'tools/test_tools.py'], { cwd: ROOT, encoding: 'utf8' });
  T.check('Testes das ferramentas em Python (links, padrão, leis, citações, registro, fila, novo artigo)', r.status === 0, (r.stderr || '').split('\n').slice(-6).join(' | '));
}

// 9) roteiro: cada trecho é idêntico ao retrato do Planalto
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const rot = read('L9099-ROTEIRO.html');
const snap = JSON.parse(read('data/laws/L9099.json')).articles;
const steps = [...rot.matchAll(/<article class="rt-step" id="art-(\d+)" data-art="\d+">([\s\S]*?)<\/article>/g)];
const badRot = [];
for (const [, n, body] of steps) {
  const got = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => dec(m[1]));
  const want = snap[n].text.split('\n').filter((x) => x.trim());
  if (JSON.stringify(got) !== JSON.stringify(want)) badRot.push(n);
}
T.check(`Roteiro da Lei 9.099: ${steps.length} artigos, texto idêntico ao retrato do Planalto`, steps.length === 27 && badRot.length === 0, 'divergem: ' + badRot.join(','));

// 10) segurança básica dos links
const badBlank = htmls.filter((f) => [...read(f).matchAll(/<a [^>]*target="_blank"[^>]*>/g)].some((m) => !/rel="[^"]*noopener/.test(m[0])));
T.check('Todo link que abre em nova aba tem rel="noopener"', badBlank.length === 0, badBlank.join(', '));

// 11) registro de precedentes: o que está cadastrado é citado no site (ou ao menos está íntegro)
const reg = JSON.parse(read('registry/precedentes.json')).entries;
const cit = JSON.parse(read('citations.json')).entries;
const semEnun = Object.keys(reg).filter((k) => reg[k].status !== 'nao-verificado' && !reg[k].enunciado);
T.check(`Registro: ${Object.keys(reg).length} precedentes cadastrados, todos com enunciado; citations.json tem ${Object.keys(cit).length}`, semEnun.length === 0 && Object.keys(cit).length >= Object.keys(reg).length - 5, semEnun.join(','));

T.done();
