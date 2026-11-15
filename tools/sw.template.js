/*
 * Service worker do Vade Mecum (modo offline).
 * ARQUIVO GERADO por tools/build.py a partir de tools/sw.template.js. Não edite sw.js à mão.
 *
 * Estratégia:
 *  - Instalação: guarda o "casco" do site (índices, scripts, CSS, fontes) e todos os artigos.
 *  - Páginas HTML: rede primeiro (conteúdo novo quando há sinal), com limite de 3,5 s; sem sinal ou
 *    com sinal ruim, usa a cópia guardada.
 *  - Scripts, CSS, fontes e imagens: cópia guardada primeiro (as URLs levam ?v=hash do conteúdo).
 *  - articles.json e search-index.json: usa a cópia guardada e atualiza em segundo plano.
 *  - Nova versão: substitui a anterior inteira de uma vez (cache com o hash da versão).
 */
const VERSION = '__VERSION__';
const CACHE = 'vm-' + VERSION;
const CRITICAL = __CRITICAL__;
const PAGES = __PAGES__;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CRITICAL);                                   // tudo ou nada: o casco precisa estar completo
    await Promise.all(PAGES.map((u) => cache.add(u).catch(() => {}))); // artigos: o que falhar baixa quando abrir
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('vm-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(request), 3500);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(request)) ||
           (await cache.match(request, { ignoreSearch: true })) ||
           (await cache.match('index.html')) ||
           Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (_) {
    return (await cache.match(request, { ignoreSearch: true })) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; }).catch(() => null);
  return hit || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const accept = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(networkFirst(request));
  } else if (/\/(articles|citations|queue|training|alteracoes|search-index-[A-Za-z0-9]+)\.json$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
