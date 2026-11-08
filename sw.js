/* Service worker SHE PKG: aplikasi tetap terbuka tanpa sinyal.
   - File aplikasi: ambil dari jaringan (maks 4 detik), bila gagal pakai salinan di HP.
   - Library CDN (versi tetap): pakai salinan di HP.
   - Data Supabase tidak disimpan di sini (diatur aplikasi sendiri). */
const VERSI = 'she-pkg-v13';
const APP = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/card.css',
  'js/config.js', 'js/card.js', 'js/foto.js', 'js/scan.js', 'js/hazard.js', 'js/ujian.js', 'js/push.js', 'js/app.js',
  'img/hm.png', 'img/pkg-mark.svg', 'img/k3.png', 'img/ttd.png', 'img/icon-192.png', 'img/favicon-32.png', 'img/badge.png', 'img/icon-512.png', 'img/apple-touch-icon.png', 'img/rambu/1.jpg', 'img/rambu/2.jpg', 'img/rambu/3.jpg', 'img/rambu/4.jpg', 'img/rambu/5.jpg'];
const CDN = ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(async c => {
    await c.addAll(APP);
    await Promise.all(CDN.map(u => fetch(u, { mode: 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const denganBatas = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(VERSI);
      const kunci = req.mode === 'navigate' ? 'index.html' : req;
      try {
        const res = await denganBatas(fetch(req), 4000);
        if (res.ok) c.put(kunci, res.clone());
        return res;
      } catch (err) {
        const ada = await c.match(kunci, { ignoreSearch: true });
        if (ada) return ada;
        throw err;
      }
    })());
    return;
  }
  if (/cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(url.host)) {
    e.respondWith(caches.open(VERSI).then(async c => {
      const ada = await c.match(req); if (ada) return ada;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }));
  }
});

/* ---- Notifikasi HP (Web Push) ---- */
const keHash = h => '#' + (h || '/').replace(/^\/kimper\/pengajuan\//, '/pengajuan/').replace(/^\/kimper\//, '/mp/');
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { judul: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.judul || 'SHE PKG', { body: d.isi || '', icon: 'img/icon-192.png', badge: 'img/badge.png',
      tag: d.id || undefined, data: { href: d.href || '/' }, vibrate: [120, 60, 120] });
    if (self.navigator && 'setAppBadge' in self.navigator && d.belum) self.navigator.setAppBadge(d.belum).catch(() => {});
    (await clients.matchAll({ type: 'window' })).forEach(c => c.postMessage({ t: 'notif' }));
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL('./' + keHash(e.notification.data && e.notification.data.href), self.registration.scope).href;
  e.waitUntil((async () => {
    const ws = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of ws) if (w.url.startsWith(self.registration.scope)) { await w.focus(); return w.navigate(url).catch(() => {}); }
    return clients.openWindow(url);
  })());
});
