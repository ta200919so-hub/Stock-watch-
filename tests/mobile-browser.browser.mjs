import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve, extname} from "node:path";
import {chromium} from "playwright";

const root=fileURLToPath(new URL("../",import.meta.url));
const screenshots=resolve(root,"tests/screenshots");
const sample=Array.from({length:7},(_,i)=>({
  symbol:i===0?"AMAT":`TEST${i}`,name:`Test Holding ${i}`,
  market:"US",shares:2,purchasePriceJPY:100,currentPriceJPY:200,
  memo:"",updatedAt:null
}));
const json=(res,data)=>{res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(data))};
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,"http://localhost").pathname;
  if(path.startsWith("/api/")){
    if(path==="/api/search")return json(res,{results:[{symbol:"7203.T",name:"トヨタ自動車"}]});
    if(path==="/api/history")return json(res,{points:[
      {date:"2026-10-01",priceJPY:100},{date:"2026-10-08",priceJPY:115},
      {date:"2026-10-15",priceJPY:105},{date:"2026-10-22",priceJPY:120}
    ]});
    if(path==="/api/quote")return json(res,{priceJPY:200,dayChangePct:1});
    if(path==="/api/news")return json(res,{items:[]});
    return json(res,{});
  }
  const filename=path==="/"?"/index.html":path;
  if(!/^\/(index\.html|app\.js|style\.css|sw\.js|manifest\.webmanifest|icon\.svg)$/.test(filename)){
    res.writeHead(404);res.end("Not found");return;
  }
  try{
    const data=await readFile(resolve(root,filename.slice(1)));
    const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",
      ".css":"text/css; charset=utf-8",".svg":"image/svg+xml",
      ".webmanifest":"application/manifest+json"}[extname(filename)]||"text/plain";
    res.writeHead(200,{"Content-Type":mime,"Cache-Control":"no-store"});res.end(data);
  }catch{res.writeHead(404);res.end("Not found")}
});

const intersects=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;

test("mobile viewport, chart, search and isolated portfolio recovery",async t=>{
  await mkdir(screenshots,{recursive:true});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    for(const width of [320,375,390,428,768]){
      await t.test(`no action overlap at ${width}px`,async()=>{
        const context=await browser.newContext({viewport:{width,height:740},deviceScaleFactor:2,
          isMobile:true,hasTouch:true});
        try{
          const page=await context.newPage();
          await page.addInitScript(data=>localStorage.setItem("stock-watch-ai-v1",JSON.stringify(data)),sample);
          await page.goto(base,{waitUntil:"load"});
          await page.locator("#openAdd").scrollIntoViewIfNeeded();
          const getRects=()=>page.evaluate(()=>{
            const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();
              return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
            return [rect("#openAdd"),rect("#openSearch")];
          });
          for(const y of [0,350,1500,99999]){
            await page.evaluate(y=>window.scrollTo(0,y),y);
            const [add,search]=await getRects();
            assert.equal(intersects(add,search),false,
              `add/search overlap at width=${width}, scroll=${y}: ${JSON.stringify({add,search})}`);
          }
          await page.screenshot({path:resolve(screenshots,`mobile-${width}.png`)});
        }finally{await context.close()}
      });
    }
    await t.test("chart ticks and Japanese stock search render",async()=>{
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      try{
        const page=await context.newPage();
        await page.addInitScript(data=>localStorage.setItem("stock-watch-ai-v1",JSON.stringify(data)),[sample[0]]);
        await page.goto(base);
        await page.locator('[data-detail="0"]').click();
        await page.locator(".history-chart svg").waitFor({timeout:10000});
        assert.equal(await page.locator(".history-chart svg text").count(),6);
        const tickBounds=await page.locator(".history-chart svg text").evaluateAll(nodes=>
          nodes.slice(1).map(node=>{
            const label=node.getBoundingClientRect(),svg=node.ownerSVGElement.getBoundingClientRect();
            return {top:label.top,bottom:label.bottom,svgTop:svg.top,svgBottom:svg.bottom};
          }));
        assert.ok(tickBounds.every(x=>x.top>=x.svgTop&&x.bottom<=x.svgBottom),
          `all five y-axis labels must be visible: ${JSON.stringify(tickBounds)}`);
        assert.equal(await page.locator(".chart-labels span").count(),3);
        await page.screenshot({path:resolve(screenshots,"chart-390.png")});
        await page.locator("#backHome").click();
        await page.locator("#openSearch").click();
        await page.locator("#globalSearch").fill("トヨタ");
        await page.locator(".global-result").first().waitFor({timeout:10000});
        assert.equal(await page.locator(".global-result").first().getAttribute("data-symbol"),"7203.T");
        await page.screenshot({path:resolve(screenshots,"search-390.png")});
      }finally{await context.close()}
    });
    await t.test("add-holding search ignores late network responses in Chromium",async()=>{
      // Intercept the page fetches directly; service workers are covered by the PWA test below.
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
      let releaseOld;
      const oldBlocked=new Promise(resolve=>{releaseOld=resolve});
      try{
        const page=await context.newPage();
        await page.route("**/api/search?*",async route=>{
          const q=new URL(route.request().url()).searchParams.get("q");
          if(q==="古い"){
            await oldBlocked;
            return route.fulfill({json:{results:[{symbol:"OLD",name:"古い会社"}]}});
          }
          return route.fulfill({json:{results:[{symbol:"NEW",name:"新しい会社"}]}});
        });
        await page.goto(base);
        await page.locator("#openAdd").click();
        const oldRequest=page.waitForRequest(req=>req.url().includes("/api/search?")&&
          new URL(req.url()).searchParams.get("q")==="古い");
        await page.locator("#name").fill("古い");
        await oldRequest;
        await page.locator("#name").fill("新しい");
        await page.locator('.suggestion[data-symbol="NEW"]').waitFor({timeout:10000});
        const oldResponse=page.waitForResponse(res=>res.url().includes("/api/search?")&&
          new URL(res.url()).searchParams.get("q")==="古い");
        releaseOld();
        await oldResponse;
        await page.waitForTimeout(100);
        assert.equal(await page.locator('.suggestion[data-symbol="OLD"]').count(),0);
        assert.equal(await page.locator('.suggestion[data-symbol="NEW"]').count(),1);
        await page.screenshot({path:resolve(screenshots,"add-search-390.png")});
        await page.locator('.suggestion[data-symbol="NEW"]').click();
        assert.equal(await page.locator("#symbol").inputValue(),"NEW");
        await page.locator("#name").fill("変更後");
        assert.equal(await page.locator("#symbol").inputValue(),"",
          "editing the name must immediately invalidate selected ticker");
        assert.equal(await page.locator("#selectedStock").isHidden(),true);
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#addDialog").evaluate(el=>el.open),false);
        await page.waitForTimeout(450);
        assert.equal(await page.locator("#suggestions").isHidden(),true,
          "closing dialog must cancel delayed suggestions");
      }finally{releaseOld();await context.close()}
    });
    await t.test("global search rejects late results after typing and clears on back",async()=>{
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
      let releaseOld;
      const oldBlocked=new Promise(resolve=>{releaseOld=resolve});
      try{
        const page=await context.newPage();
        await page.route("**/api/search?*",async route=>{
          const q=new URL(route.request().url()).searchParams.get("q");
          if(q==="古い"){await oldBlocked;return route.fulfill({json:{results:[{symbol:"OLD",name:"古い会社"}]}})}
          return route.fulfill({json:{results:[{symbol:"NEW",name:"新しい会社"}]}});
        });
        await page.goto(base);
        await page.locator("#openSearch").click();
        const oldRequest=page.waitForRequest(req=>req.url().includes("/api/search?")&&
          new URL(req.url()).searchParams.get("q")==="古い");
        await page.locator("#globalSearch").fill("古い");
        await oldRequest;
        await page.locator("#globalSearch").fill("新しい");
        const oldResponse=page.waitForResponse(res=>res.url().includes("/api/search?")&&
          new URL(res.url()).searchParams.get("q")==="古い");
        releaseOld();
        await oldResponse;
        await page.locator('.global-result[data-symbol="NEW"]').first().waitFor({timeout:10000});
        assert.equal(await page.locator('.global-result[data-symbol="OLD"]').count(),0);
        await page.locator("#searchBack").click();
        assert.equal(await page.locator("#globalSearch").inputValue(),"");
        await page.locator("#openSearch").click();
        assert.equal(await page.locator(".global-result").count(),0);
      }finally{releaseOld();await context.close()}
    });

    await t.test("leaving global search during quote loading never opens stale detail",async()=>{
      const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
      let releaseQuote;
      const quoteGate=new Promise(resolve=>{releaseQuote=resolve});
      try{
        const page=await context.newPage();
        await page.route("**/api/quote?*",async route=>{
          await quoteGate;
          await route.fulfill({json:{priceJPY:200,dayChangePct:1}});
        });
        await page.goto(base);
        await page.locator("#openSearch").click();
        await page.locator("#globalSearch").fill("トヨタ");
        await page.locator(".global-result").first().waitFor({timeout:10000});
        const quoteRequest=page.waitForRequest(req=>req.url().includes("/api/quote?"));
        await page.locator(".global-result").first().click();
        await quoteRequest;
        await page.locator("#searchBack").click();
        const quoteResponse=page.waitForResponse(res=>res.url().includes("/api/quote?"));
        releaseQuote();
        await quoteResponse;
        await page.waitForTimeout(150);
        assert.equal(await page.locator("#homeView").isHidden(),false);
        assert.equal(await page.locator("#detailView").isHidden(),true);
        assert.equal(await page.locator("#searchView").isHidden(),true);
      }finally{releaseQuote();await context.close()}
    });
    await t.test("corrupt primary recovers backup without modifying stored holdings",async()=>{
      const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
      try{
        const page=await context.newPage();
        await page.goto(base);
        await page.evaluate(data=>{
          localStorage.setItem("stock-watch-ai-v1","{corrupt");
          localStorage.setItem("stock-watch-ai-backup-v1",JSON.stringify(data));
        },[sample[0]]);
        await page.reload();
        assert.equal(await page.locator("#list .card").count(),1);
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("stock-watch-ai-backup-v1"))[0].symbol),"AMAT");
        await page.evaluate(()=>localStorage.setItem("stock-watch-ai-v1","[]"));
        await page.reload();
        assert.equal(await page.locator("#list .card").count(),0,"intentional empty primary must not restore deleted holding");
        const cache=await page.evaluate(async()=>{
          await navigator.serviceWorker.ready;
          return await caches.keys();
        });
        const swSource=await readFile(resolve(root,"sw.js"),"utf8");
        const expectedCache=swSource.match(/^const CACHE="([^"]+)";/m)?.[1];
        assert.ok(expectedCache,"PWA cache revision must be declared");
        assert.ok(cache.includes(expectedCache),"PWA revision must install");
      }finally{await context.close()}
    });
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
