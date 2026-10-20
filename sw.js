// NutriPlan PRO — service worker (офлайн-режим)
// Змінюйте VERSION при кожному оновленні файлів, щоб старий кеш очищався.
const VERSION = 'nutriplan-v5';

const CORE_FILES = [
  './',
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];

// Зовнішні бібліотеки, без яких сторінка не виглядатиме правильно офлайн
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(CORE_FILES);
    // Зовнішні ресурси кешуємо «по можливості»: збій одного не ламає встановлення
    await Promise.all(CDN_URLS.map(async url => {
      try {
        const res = await fetch(new Request(url, { mode: 'no-cors' }));
        await cache.put(url, res);
      } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Запити до Gemini API ніколи не кешуємо
  if (url.hostname === 'generativelanguage.googleapis.com') return;

  // Сторінка: спочатку мережа (щоб оновлення з'являлися), офлайн — з кешу
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(VERSION);
          cache.put('index.html', res.clone());
        }
        return res;
      } catch (e) {
        const cached = (await caches.match('index.html')) || (await caches.match('./'));
        return cached || Response.error();
      }
    })());
    return;
  }

  // Свої файли та CDN: з кешу, а в фоні оновлюємо
  if (url.origin === self.location.origin || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      const network = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || Response.error();
    })());
  }
});
