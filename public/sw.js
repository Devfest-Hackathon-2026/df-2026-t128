// Only handle navigation to the entry page. Conversation requests and audio
// go straight to the network; no response is written to Cache Storage.
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' ||
      url.origin !== self.location.origin || url.pathname !== '/') return;
  event.respondWith(fetch(event.request).catch(() => new Response(`<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#15291f"><title>オフライン | KindSignal</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:#15291f;color:#fbfaf4;font:1rem/1.7 system-ui,sans-serif}h1{font-size:1.6rem}a{display:inline-block;padding:.6rem 1rem;border-radius:.65rem;background:#faf8ef;color:#253a2e;text-decoration:none}</style>
<main><strong>KindSignal</strong><h1>インターネットに接続していません</h1><p>会話を始めるには、接続してから開き直してください。</p><a href="/">開き直す</a></main></html>`,
    {headers: {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
});
