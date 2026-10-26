const CACHE="stock-watch-ai-v4-49";
const ASSETS=["./","./index.html","./style.css?v=4.31","./app.js?v=4.43","./manifest.webmanifest","./icon.svg"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener("activate",e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("stock-watch-ai-")&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.pathname.startsWith("/api/")){e.respondWith(fetch(e.request));return}
  if(e.request.mode==="navigate"){
    // Only the app's own HTML shell may replace the offline homepage.
    const root=new URL("./",self.location.href);
    const isShell=u.origin===root.origin&&(u.pathname===root.pathname||u.pathname===root.pathname+"index.html");
    let settleCache;
    const cacheDone=new Promise(resolve=>{settleCache=resolve});
    e.waitUntil(cacheDone);
    e.respondWith(fetch(e.request).then(r=>{
      const type=r.headers?.get?.("content-type")||"";
      if(!r.ok||!isShell||r.redirected||!type.toLowerCase().includes("text/html")){settleCache();return r}
      const copy=r.clone();
      Promise.resolve().then(()=>caches.open(CACHE)).then(c=>c.put("./index.html",copy)).catch(()=>{}).finally(settleCache);
      return r;
    }).catch(error=>{
      settleCache();
      if(!isShell)throw error;
      return caches.open(CACHE).then(c=>c.match("./index.html"));
    }));
    return;
  }
  // Refresh the app code while online; use the last verified cached version offline.
  // This prevents a stale app.js/style.css from persisting after an update.
  const root=new URL("./",self.location.href);
  const jsPath=new URL("./app.js",root).pathname;
  const cssPath=new URL("./style.css",root).pathname;
  if(u.origin===root.origin&&(u.pathname===jsPath||u.pathname===cssPath)&&e.request.method==="GET"){
    e.respondWith(fetch(e.request).then(r=>{
      const type=r.headers?.get?.("content-type")||"";
      const expected=u.pathname===jsPath?/javascript|ecmascript/i:/text\/css/i;
      if(r.ok&&!r.redirected&&expected.test(type)){
        const copy=r.clone();
        e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}));
      }
      return r;
    }).catch(()=>caches.open(CACHE).then(c=>c.match(e.request))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(c=>c.match(e.request)).then(r=>r||fetch(e.request)));
});
