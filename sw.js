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
const VERSION = 'cf8461cdec';
const CACHE = 'vm-' + VERSION;
const CRITICAL = [
 "./",
 "index.html",
 "index-penal.html",
 "index-civil.html",
 "index-clt.html",
 "index-jecrim.html",
 "treino.html",
 "sumulas.html",
 "calculadoras.html",
 "L9099-ROTEIRO.html",
 "article-nav.js?v=df4cb9f7",
 "article-tools.js?v=ccf5501a",
 "articles.json",
 "autobackup.js?v=39804a34",
 "calc-core.js?v=2c10a247",
 "calculadoras.js?v=b2f03ee1",
 "citations.json",
 "dashboard.js?v=a7650404",
 "data/alteracoes.json",
 "data/laws/CP.json",
 "data/laws/CPP.json",
 "data/laws/L9099.json",
 "em-breve.js?v=6487e366",
 "fonts.css?v=042dc32b",
 "fonts/cinzel-normal-400.woff2",
 "fonts/cormorant-garamond-italic-400.woff2",
 "fonts/cormorant-garamond-normal-400.woff2",
 "fonts/cormorant-sc-normal-400.woff2",
 "fonts/cormorant-sc-normal-600.woff2",
 "fonts/cormorant-sc-normal-700.woff2",
 "fonts/crimson-pro-italic-300.woff2",
 "fonts/crimson-pro-normal-300.woff2",
 "fonts/dm-sans-italic-300.woff2",
 "fonts/dm-sans-normal-300.woff2",
 "fonts/eb-garamond-italic-400.woff2",
 "fonts/eb-garamond-normal-400.woff2",
 "fonts/fraunces-italic-400.woff2",
 "fonts/fraunces-normal-300.woff2",
 "fonts/jetbrains-mono-normal-400.woff2",
 "fonts/libre-baskerville-italic-400.woff2",
 "fonts/libre-baskerville-normal-400.woff2",
 "fonts/lora-italic-400.woff2",
 "fonts/lora-normal-400.woff2",
 "fonts/playfair-display-italic-600.woff2",
 "fonts/playfair-display-normal-400.woff2",
 "fonts/source-serif-4-italic-300.woff2",
 "fonts/source-serif-4-normal-300.woff2",
 "fonts/spectral-italic-300.woff2",
 "fonts/spectral-italic-400.woff2",
 "fonts/spectral-normal-300.woff2",
 "fonts/spectral-normal-400.woff2",
 "fonts/spectral-normal-600.woff2",
 "fonts/spectral-normal-700.woff2",
 "icons/icon-192.png",
 "icons/icon-512.png",
 "icons/icon-maskable-512.png",
 "manifest.webmanifest",
 "pwa.js?v=64776eec",
 "queue.json",
 "registry/patterns.json",
 "script.js?v=94f15684",
 "search-index-CC.json",
 "search-index-CLT.json",
 "search-index-CP.json",
 "search-index-L9099.json",
 "search.js?v=850d6b8d",
 "session-banner.js?v=d87419ae",
 "study-bar.css?v=25ed22b4",
 "study-tracker.js?v=f399bc97",
 "style.css?v=101f5f42",
 "sumulas.js?v=f2efb342",
 "tool-pages.css?v=c45da391",
 "training.json",
 "treino.js?v=819edcdf",
 "vendor/chart.umd.min.js?v=49aef4c2",
 "vm-data.js?v=0167acda"
];
const PAGES = [
 "DP-ART-1.html",
 "DP-ART-2.html",
 "DP-ART-3.html",
 "DP-ART-4.html",
 "DP-ART-5.html",
 "DP-ART-6.html",
 "DP-ART-7.html",
 "DP-ART-8.html",
 "DP-ART-9.html",
 "DP-ART-10.html",
 "DP-ART-11.html",
 "DP-ART-12.html",
 "DP-ART-13.html",
 "DP-ART-14.html",
 "DP-ART-15.html",
 "DP-ART-16.html",
 "DP-ART-17.html",
 "DP-ART-18.html",
 "DP-ART-19.html",
 "DP-ART-20.html",
 "DP-ART-21.html",
 "DP-ART-22.html",
 "DP-ART-23.html",
 "DP-ART-24.html",
 "DP-ART-25.html",
 "DP-ART-26.html",
 "DP-ART-27.html",
 "DP-ART-28.html",
 "CC-ART-1.html",
 "CC-ART-2.html",
 "CC-ART-3.html",
 "CC-ART-4.html",
 "CC-ART-5.html",
 "CLT-ART-1.html",
 "CLT-ART-2.html",
 "CLT-ART-3.html",
 "L9099-ART-60.html",
 "L9099-ART-61.html",
 "L9099-ART-62.html",
 "L9099-ART-63.html",
 "L9099-ART-64.html",
 "L9099-ART-65.html"
];

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
