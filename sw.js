const CACHE = 'stella-v15';
const SHELL_SUFFIX = ['/', '/index.html', '/app-v14.js', '/styles-v10.css', '/manifest.json'];
const ASSETS = [
  './',
  './index.html',
  './app-v14.js',
  './styles-v10.css',
  './manifest.json',
  './icons/icon-192-v3.png',
  './icons/icon-512-v3.png',
  './assets/geo_poster_2026-07-30.jpg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      for (const url of ASSETS) {
        try { await c.add(url); }
        catch (err) { console.warn('[SW] 缓存失败(已忽略):', url, err); }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const isShell = SHELL_SUFFIX.some(s => url.pathname.endsWith(s));
  if (isShell) {
    // 外壳资源：网络优先，保证改 CSS/JS 后下次打开即生效（离线时回退缓存）
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // 其余资源：缓存优先
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html'))));
});
