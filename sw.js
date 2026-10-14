const CACHE="stock-watch-ai-v4-5";
const ASSETS=["./","./index.html","./style.css?v=4.5","./app.js?v=4.5","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("stock-watch-ai-")&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.pathname.startsWith("/api/")){e.respondWith(fetch(e.request));return}
  if(e.request.mode==="navigate"){
    let settleCache;
    const cacheDone=new Promise(resolve=>{settleCache=resolve});
    e.waitUntil(cacheDone);
    e.respondWith(fetch(e.request).then(r=>{
      if(!r.ok){settleCache();return r}
      const copy=r.clone();
      Promise.resolve().then(()=>caches.open(CACHE)).then(c=>c.put("./index.html",copy)).catch(()=>{}).finally(settleCache);
      return r;
    }).catch(()=>{settleCache();return caches.open(CACHE).then(c=>c.match("./index.html"))}));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));
});