/* =========================================================
   sw.js — 서비스 워커 (인터넷 없이도 앱이 열리게 해 줘요)
   ---------------------------------------------------------
   처음 열 때 앱 파일을 휴대폰에 저장(캐시)해 두고,
   다음부터는 저장해 둔 파일로 바로 열어요.
   ★ 앱 파일을 고쳤다면 아래 VERSION 숫자를 올려 주세요.
     그래야 휴대폰이 새 파일을 다시 받아요.
   ========================================================= */
const VERSION = 'harukana-v7';
const AUDIO_CACHE = 'harukana-audio';   // 캐릭터 목소리 파일 (버전이 바뀌어도 지우지 않아요)
const FONT_CACHE = 'harukana-fonts';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './kana-data.js',
  './vocab-data.js',
  './videos-data.js',
  './lessons-data.js',
  './audio/index.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// 설치: 앱 파일을 저장해 둬요
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

// 새 버전이 켜지면 옛날 저장본을 지워요
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONT_CACHE && k !== AUDIO_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 글꼴(구글 폰트): 한 번 받으면 저장해 두고 계속 써요
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
          return res;
        } catch (e) {
          return new Response('', { status: 504 });   // 오프라인: 기본 글꼴로 보여요
        }
      })
    );
    return;
  }

  // 캐릭터 목소리 파일: 한 번 들으면 저장해 두고 다음부터는 바로 재생해요
  if (url.origin === self.location.origin && url.pathname.includes('/audio/') && url.pathname.endsWith('.mp3')) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // 앱 파일: 저장본을 먼저 보여주고, 뒤에서 몰래 새 파일로 바꿔 둬요
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(VERSION).then(async cache => {
        const hit = await cache.match(req, { ignoreSearch: true });
        const network = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        if (hit) { event.waitUntil(network); return hit; }
        const res = await network;
        return res || (req.mode === 'navigate' ? cache.match('./index.html') : new Response('', { status: 504 }));
      })
    );
  }
});
