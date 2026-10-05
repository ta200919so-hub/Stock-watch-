const CACHE="stock-watch-ai-v3-8";
const ASSETS=["./","./index.html","./style.css?v=3.8","./app.js?v=3.8","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.pathname.startsWith("/api/")){e.respondWith(fetch(e.request));return}
  if(e.request.mode==="navigate"){e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put("./index.html",c));return r}).catch(()=>caches.match("./index.html")));return}
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});