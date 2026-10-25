import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const APP=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const HISTORY=readFileSync(new URL("../api/history.js",import.meta.url),"utf8");
const SEARCH=readFileSync(new URL("../api/search.js",import.meta.url),"utf8");
const KEY="stock-watch-ai-v1", BACKUP="stock-watch-ai-backup-v1";
const holding={symbol:"AMAT",name:"Applied Materials",market:"US",shares:2,purchasePriceJPY:100,currentPriceJPY:200};
function element(){
 return {value:"",textContent:"",innerHTML:"",hidden:false,open:false,dataset:{},style:{},isConnected:true,handlers:{},
  classList:{add(){},remove(){},toggle(){}},
  addEventListener(event,fn){this.handlers[event]=fn},
  showModal(){this.open=true},close(){this.open=false},reset(){this.resetCalled=true},focus(){},
  prepend(child){this.child=child;child.isConnected=true},
  querySelector(){return element()},querySelectorAll(){return []}};
}
function boot(storage={},failPrimary=false,request){
 const map=new Map(Object.entries(storage)),nodes=new Map(),alerts=[];
 const document={querySelector(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key)},
  querySelectorAll(){return []},createElement(){return element()}};
 const localStorage={getItem(key){return map.has(key)?map.get(key):null},
  setItem(key,value){if(failPrimary&&key===KEY)throw Error("storage full");map.set(key,String(value))},
  removeItem(key){map.delete(key)}};
 const fetch=request||(async url=>({ok:true,json:async()=>url.startsWith("/api/quote")?
   {priceJPY:200,dayChangePct:1}:url.startsWith("/api/search")?{results:[]}:url.startsWith("/api/history")?
   {points:[{date:"2026-10-01",priceJPY:100},{date:"2026-10-02",priceJPY:110}]}:{items:[]}}));
 const context={document,localStorage,navigator:{},window:{scrollTo(){}},fetch,
  setTimeout(){return 0},clearTimeout(){},alert(x){alerts.push(x)},confirm(){return true},
  console:{warn(){},error(){}},AbortController,Intl,Date,Number,Math,Set,Promise,JSON,Array,String};
 vm.createContext(context);
 vm.runInContext(APP,context,{filename:"app.js"});
 return {context,map,nodes,alerts,node:id=>document.querySelector(id),stocks:()=>vm.runInContext("stocks",context)};
}
function api(source,fetch){
 const context={fetch,URL,Date,Number,Math,Set,String,encodeURIComponent};
 vm.createContext(context);
 return vm.runInContext(source.replace("export default async function handler","async function handler")+"\nhandler",context);
}
function response(){return {code:0,headers:{},status(code){this.code=code;return this},setHeader(k,v){this.headers[k]=v},json(data){this.body=data;return this}}}
function chart(prices,currency="JPY"){
 return {chart:{result:[{meta:{currency},timestamp:prices.map((_,i)=>Date.UTC(2026,9,1+i)/1000),
  indicators:{quote:[{close:prices}]}}]}};
}
test("unknown quote never creates a fictitious 100% portfolio loss or allocation",()=>{
 const unknown={...holding,symbol:"NVDA",name:"NVIDIA",currentPriceJPY:0};
 const x=boot({[KEY]:JSON.stringify([holding,unknown])});
 assert.equal(x.node("#totalCost").textContent,"¥400");
 assert.equal(x.node("#totalValue").textContent,"—");
 assert.equal(x.node("#totalPnl").textContent,"—");
 assert.equal(x.node("#totalPnlPct").textContent,"—");
 assert.equal(x.node("#donut").style.background,"var(--panel2)");
 assert.equal(x.node("#donutTotal").textContent,"—");
 assert.equal(x.node("#holdingCount").textContent,"2銘柄");
 assert.match(x.node("#legend").innerHTML,/株価未取得/);
 assert.doesNotMatch(vm.runInContext("focusScore(stocks[0]).reasons.join(\"・\")",x.context),/保有比率/,"unknown holdings must not inflate the displayed concentration");
 assert.doesNotMatch(vm.runInContext("decision(stocks[0]).reasons.join(\"・\")",x.context),/ポートフォリオ比率/,"unknown quotes must not trigger concentration penalty");
 assert.equal(JSON.parse(x.map.get(KEY)).length,2,"render must not alter stored holdings");
 const known=boot({[KEY]:JSON.stringify([holding])});
 assert.equal(known.node("#totalValue").textContent,"¥400");
 assert.equal(known.node("#totalPnl").textContent,"+¥200");
 assert.equal(known.node("#totalPnlPct").textContent,"+100.0%");
 assert.match(vm.runInContext("focusScore(stocks[0]).reasons.join(\"・\")",known.context),/保有比率/,"complete quotes still show concentration");
});
test("a wholly unpriced portfolio does not show a -100% loss",()=>{
 const x=boot({[KEY]:JSON.stringify([{...holding,currentPriceJPY:0}])});
 assert.equal(x.node("#totalValue").textContent,"—");
 assert.equal(x.node("#totalPnl").textContent,"—");
 assert.equal(x.node("#totalPnlPct").textContent,"—");
});

test("legacy holding with shares but missing buy price renders without crashing or changing storage",()=>{
 for(const badPrice of [0,null]){
  const incomplete={...holding,purchasePriceJPY:badPrice};
  const original=JSON.stringify([incomplete]);
  const x=boot({[KEY]:original});
  assert.equal(x.stocks().length,1,"holding must remain visible for manual repair");
  assert.match(x.node("#list").innerHTML,/アプライド マテリアルズ/);
  assert.match(x.node("#list").innerHTML,/含み損益<\/span><strong[^>]*>—<\/strong>/,
    "missing purchase cost must show unknown P&L instead of crashing or claiming a gain");
  assert.match(x.node("#list").innerHTML,/購入価格<\/span><strong>—<\/strong>/);
  assert.equal(x.map.get(KEY),original,"render must not mutate the saved portfolio");
  assert.equal(x.map.has(BACKUP),false,"render must not rotate recovery backups");
 }
});
test("recovers valid backup when primary JSON is corrupt",()=>{
 const x=boot({[KEY]:"{broken",[BACKUP]:JSON.stringify([holding])});
 assert.equal(x.stocks().length,1);
});
test("valid empty holdings do not resurrect deleted backup",()=>{
 const x=boot({[KEY]:"[]",[BACKUP]:JSON.stringify([holding])});
 assert.equal(x.stocks().length,0);
});
test("save preserves previous valid state as backup",()=>{
 const x=boot({[KEY]:JSON.stringify([holding])});
 x.stocks().splice(0,1);
 assert.equal(vm.runInContext("save()",x.context),true);
 assert.equal(x.map.get(KEY),"[]");
 assert.equal(JSON.parse(x.map.get(BACKUP))[0].symbol,"AMAT");
});
test("re-adding a holding after an empty portfolio preserves the last recoverable backup",()=>{
 const x=boot({[KEY]:"[]",[BACKUP]:JSON.stringify([holding])});
 assert.equal(x.stocks().length,0,"an intentional empty primary remains empty");
 x.stocks().push({...holding,symbol:"MSFT",name:"Microsoft"});
 assert.equal(vm.runInContext("save()",x.context),true);
 assert.equal(JSON.parse(x.map.get(KEY))[0].symbol,"MSFT");
 assert.equal(JSON.parse(x.map.get(BACKUP))[0].symbol,"AMAT",
  "saving a new holding must not replace the only non-empty backup with []");
 x.map.set(KEY,"{corrupt");
 const recovered=boot(Object.fromEntries(x.map));
 assert.equal(recovered.stocks()[0].symbol,"AMAT");
});
test("unrecoverable primary data is never silently overwritten",()=>{
 for(const corrupt of ["{broken",JSON.stringify({symbol:"AMAT"}),JSON.stringify([null,false,42])]){
  const x=boot({[KEY]:corrupt});
  x.stocks().push({...holding});
  assert.equal(vm.runInContext("save()",x.context),false);
  assert.equal(x.map.get(KEY),corrupt,"preserve original data for manual recovery");
  assert.equal(x.map.has(BACKUP),false);
  assert.equal(x.alerts.length,1);
 }
});
test("unrecoverable primary and invalid backup are both preserved",()=>{
 const x=boot({[KEY]:"{broken",[BACKUP]:"[null]"});
 x.stocks().push({...holding});
 assert.equal(vm.runInContext("save()",x.context),false);
 assert.equal(x.map.get(KEY),"{broken");
 assert.equal(x.map.get(BACKUP),"[null]");
});
test("failed primary write keeps the previous recovery snapshot",()=>{
 const older={...holding,symbol:"OLD",name:"Older recovery"};
 const original=JSON.stringify([holding]), backup=JSON.stringify([older]);
 const x=boot({[KEY]:original,[BACKUP]:backup},true);
 x.stocks().push({...holding,symbol:"MSFT",name:"Microsoft"});
 assert.equal(vm.runInContext("save()",x.context),false);
 assert.equal(x.map.get(KEY),original,"failed write must preserve primary");
 assert.equal(x.map.get(BACKUP),backup,"failed write must restore older backup");
 assert.equal(x.alerts.length,1);
});
test("failed primary write removes only the newly staged backup when none existed",()=>{
 const original=JSON.stringify([holding]);
 const x=boot({[KEY]:original},true);
 x.stocks().push({...holding,symbol:"MSFT",name:"Microsoft"});
 assert.equal(vm.runInContext("save()",x.context),false);
 assert.equal(x.map.get(KEY),original);
 assert.equal(x.map.has(BACKUP),false,"failed write must not leave a new backup");
});
test("invalid successful quote responses never erase an existing portfolio price",async()=>{
 for(const bad of [null,0,-1,"invalid",undefined]){
  const x=boot({[KEY]:JSON.stringify([holding])},false,async url=>({
   ok:true,json:async()=>url.startsWith("/api/quote")?{priceJPY:bad,dayChangePct:12}:{items:[]}
  }));
  await assert.rejects(vm.runInContext("refreshOne(stocks[0])",x.context),/invalid_quote/);
  assert.equal(x.stocks()[0].currentPriceJPY,200,"invalid quote must preserve the prior price");
  assert.equal(x.stocks()[0].dayChangePct,undefined,"invalid quote must not alter the daily change");
  await vm.runInContext("refreshAll()",x.context);
  assert.equal(JSON.parse(x.map.get(KEY))[0].currentPriceJPY,200,
   "invalid quote must not be persisted over the previous price");
  assert.match(x.node("#status").textContent,/株価を取得できませんでした/);
 }
});
test("failed quote refresh preserves both portfolio snapshots without backup rotation",async()=>{
 const older={...holding,symbol:"OLD",name:"Older recovery"};
 const primary=JSON.stringify([holding]),backup=JSON.stringify([older]);
 const x=boot({[KEY]:primary,[BACKUP]:backup},false,async()=>({ok:false,json:async()=>({})}));
 await vm.runInContext("refreshAll()",x.context);
 assert.equal(x.map.get(KEY),primary,"failed refresh must not write unchanged primary");
 assert.equal(x.map.get(BACKUP),backup,"failed refresh must not destroy the older recovery point");
 assert.match(x.node("#status").textContent,/株価を取得できませんでした/);
});
test("failed automatic refresh does not claim holdings were saved",async()=>{
 const x=boot({[KEY]:JSON.stringify([holding])},true);
 await vm.runInContext("refreshAll()",x.context);
 assert.match(x.node("#status").textContent,/保存できませんでした/);
 assert.equal(x.node("#status").className,"status error");
});
test("saving recovered holdings does not overwrite the only good backup with invalid primary entries",()=>{
 const badPrimary=JSON.stringify([null,false,"invalid",42]);
 const x=boot({[KEY]:badPrimary,[BACKUP]:JSON.stringify([holding])});
 assert.equal(x.stocks()[0].symbol,"AMAT","boot must load valid backup");
 x.stocks().push({...holding,symbol:"MSFT",name:"Microsoft"});
 assert.equal(vm.runInContext("save()",x.context),true);
 assert.equal(JSON.parse(x.map.get(KEY)).length,2);
 assert.equal(JSON.parse(x.map.get(BACKUP))[0].symbol,"AMAT",
  "malformed non-empty primary must never replace the only valid recovery snapshot");
 x.map.set(KEY,"{corrupt");
 const recovered=boot(Object.fromEntries(x.map));
 assert.equal(recovered.stocks()[0].symbol,"AMAT");
});
test("partially corrupt primary is readable but never silently overwritten",()=>{
 const mixed=JSON.stringify([null,holding,{unexpected:1}]);
 const x=boot({[KEY]:mixed});
 assert.equal(x.stocks().length,1,"recognizable holdings remain visible for recovery");
 x.stocks().push({...holding,symbol:"MSFT",name:"Microsoft"});
 assert.equal(vm.runInContext("save()",x.context),false);
 assert.equal(x.map.get(KEY),mixed,"mixed primary must remain available for manual recovery");
 assert.equal(x.map.has(BACKUP),false);
 assert.equal(x.alerts.length,1);
});
test("complete backup wins over a partially corrupt primary and is preserved",()=>{
 const mixed=JSON.stringify([null,{...holding,symbol:"PARTIAL"},42]);
 const complete=JSON.stringify([holding]);
 const x=boot({[KEY]:mixed,[BACKUP]:complete});
 assert.equal(x.stocks().length,1);
 assert.equal(x.stocks()[0].symbol,"AMAT","prefer complete backup to partial primary");
 x.stocks().push({...holding,symbol:"MSFT",name:"Microsoft"});
 assert.equal(vm.runInContext("save()",x.context),true);
 assert.equal(JSON.parse(x.map.get(KEY)).length,2);
 assert.equal(x.map.get(BACKUP),complete,"do not rotate a corrupt primary into backup");
 x.map.set(KEY,"{broken");
 assert.equal(boot(Object.fromEntries(x.map)).stocks()[0].symbol,"AMAT");
});
test("partial backup cannot authorize overwriting a corrupt primary",()=>{
 const primary="{broken", backup=JSON.stringify([null,holding]);
 const x=boot({[KEY]:primary,[BACKUP]:backup});
 assert.equal(x.stocks().length,1);
 x.stocks().push({...holding,symbol:"MSFT"});
 assert.equal(vm.runInContext("save()",x.context),false);
 assert.equal(x.map.get(KEY),primary);
 assert.equal(x.map.get(BACKUP),backup);
});
test("empty-object primary does not hide a recoverable portfolio backup",()=>{
  const x=boot({[KEY]:JSON.stringify([{}]),[BACKUP]:JSON.stringify([holding])});
  assert.equal(x.stocks().length,1);
  assert.equal(x.stocks()[0].symbol,"AMAT");
  x.stocks().push({...holding,symbol:"MSFT",name:"Microsoft"});
  assert.equal(vm.runInContext("save()",x.context),true);
  assert.equal(JSON.parse(x.map.get(BACKUP))[0].symbol,"AMAT",
    "a malformed primary must not replace the only valid backup");
});
test("unrecognizable primary or backup objects never authorize overwriting data",()=>{
  for(const corrupt of ['[{}]','[{"unexpected":1}]']){
    const x=boot({[KEY]:corrupt,[BACKUP]:'[{}]'});
    x.stocks().push({...holding});
    assert.equal(vm.runInContext("save()",x.context),false);
    assert.equal(x.map.get(KEY),corrupt);
    assert.equal(x.map.get(BACKUP),'[{}]');
  }
});
test("legacy holdings identified by company name remain recoverable",()=>{
  const x=boot({[KEY]:JSON.stringify([{name:"旧銘柄",start:100,current:110}])});
  assert.equal(x.stocks().length,1);
  assert.equal(x.stocks()[0].name,"旧銘柄");
  assert.equal(x.stocks()[0].purchasePriceJPY,100);
});

test("search result detail back returns to search",async()=>{
 const x=boot();
 await vm.runInContext('renderExternalDetail({symbol:"AMAT",name:"AMAT",market:"US",currentPriceJPY:200})',x.context);
 x.node("#backHome").handlers.click();
 assert.equal(x.node("#searchView").hidden,false);
 assert.equal(x.node("#homeView").hidden,true);
});
test("failed add save leaves portfolio unchanged and form open",async()=>{
 const x=boot({},true);
 x.node("#symbol").value="AMAT";x.node("#market").value="US";
 x.node("#name").value="AMAT";x.node("#shares").value="2";x.node("#purchasePrice").value="100";
 x.node("#addDialog").open=true;
 await x.node("#addForm").handlers.submit({preventDefault(){},target:{reset(){}}});
 assert.equal(x.stocks().length,0);
 assert.equal(x.node("#addDialog").open,true);
});
test("failed edit save restores original values",()=>{
 const x=boot({[KEY]:JSON.stringify([holding])},true);
 x.node("#editIndex").value="0";x.node("#editPurchasePrice").value="999";
 x.node("#editShares").value="9";x.node("#editPurchaseDate").value="2026-10-11";
 x.node("#editMemo").value="new";
 x.node("#editForm").handlers.submit({preventDefault(){}});
 assert.equal(x.stocks()[0].purchasePriceJPY,100);
 assert.equal(x.stocks()[0].shares,2);
});
test("history endpoint returns dated Japanese yen points",async()=>{
 const handler=api(HISTORY,async()=>({ok:true,json:async()=>chart([100,110])}));
 const r=response();await handler({query:{symbol:"7203.T",market:"JP",range:"1mo"}},r);
 assert.equal(r.code,200);assert.equal(r.body.points.length,2);assert.equal(r.body.points[1].priceJPY,110);
});
test("USD chart fails safely when FX data is unavailable",async()=>{
 const handler=api(HISTORY,async url=>({ok:true,json:async()=>url.includes("JPY%3DX")?chart([]):chart([100,110],"USD")}));
 const r=response();await handler({query:{symbol:"AMAT",market:"US",range:"1mo"}},r);
 assert.equal(r.code,502);
});
test("history rejects invalid symbol",async()=>{
 const handler=api(HISTORY,async()=>{throw Error("should not fetch")});
 const r=response();await handler({query:{symbol:"../../x",market:"US",range:"1mo"}},r);
 assert.equal(r.code,400);
});
test("Japanese aliases return correct ticker",async()=>{
 const handler=api(SEARCH,async()=>({ok:true,json:async()=>({quotes:[]})}));
 const r=response();await handler({query:{q:"ＴＯＴＯ",market:"JP"}},r);
 assert.equal(r.code,200);assert.equal(r.body.results[0].symbol,"5332.T");
});

test("add-holding search keeps newest results when older requests finish last",async()=>{
 const pending=[];
 const x=boot({},false,url=>new Promise(resolve=>pending.push({url,resolve})));
 x.node("#name").value="old";
 const old=vm.runInContext("searchStocks()",x.context);
 x.node("#name").value="new";
 const latest=vm.runInContext("searchStocks()",x.context);
 assert.equal(pending.length,2);
 pending[1].resolve({ok:true,json:async()=>({results:[{symbol:"NEW",name:"New Company"}]})});
 await latest;
 pending[0].resolve({ok:true,json:async()=>({results:[{symbol:"OLD",name:"Old Company"}]})});
 await old;
 assert.match(x.node("#suggestions").innerHTML,/NEW/);
 assert.doesNotMatch(x.node("#suggestions").innerHTML,/OLD/);
});
test("editing a selected stock name immediately clears ticker and ignores late suggestions",async()=>{
 let release;
 const x=boot({},false,()=>new Promise(resolve=>{release=resolve}));
 x.node("#name").value="AMAT";
 x.node("#symbol").value="AMAT";
 x.node("#selectedStock").hidden=false;
 const pending=vm.runInContext("searchStocks()",x.context);
 x.node("#name").value="MSFT";
 x.node("#name").handlers.input();
 assert.equal(x.node("#symbol").value,"");
 assert.equal(x.node("#selectedStock").hidden,true);
 release({ok:true,json:async()=>({results:[{symbol:"AMAT",name:"Applied Materials"}]})});
 await pending;
 assert.equal(x.node("#suggestions").hidden,true);
 assert.doesNotMatch(x.node("#suggestions").innerHTML,/AMAT/);
});

test("closing add dialog with Escape invalidates pending search results",async()=>{
 let release;
 const x=boot({},false,()=>new Promise(resolve=>{release=resolve}));
 x.node("#name").value="AMAT";
 x.node("#addDialog").open=true;
 const pending=vm.runInContext("searchStocks()",x.context);
 x.node("#addDialog").open=false;
 x.node("#addDialog").handlers.close();
 assert.equal(x.node("#suggestions").hidden,true);
 release({ok:true,json:async()=>({results:[{symbol:"AMAT",name:"Applied Materials"}]})});
 await pending;
 assert.equal(x.node("#suggestions").hidden,true);
 assert.doesNotMatch(x.node("#suggestions").innerHTML,/AMAT/);
});

test("global search clears stale results immediately when input changes",async()=>{
 const pending=[];
 const x=boot({},false,url=>new Promise(resolve=>pending.push({url,resolve})));
 x.node("#globalSearch").value="old";
 const old=vm.runInContext("globalSearch()",x.context);
 assert.equal(pending.length,2,"JP and US requests start together");
 x.node("#globalSuggestions").innerHTML='<button>OLD</button>';
 x.node("#globalSearch").value="new";
 x.node("#globalSearch").handlers.input();
 assert.equal(x.node("#globalSuggestions").innerHTML,"");
 pending.forEach(p=>p.resolve({ok:true,json:async()=>({results:[{symbol:"OLD",name:"Old Company"}]})}));
 await old;
 assert.equal(pending.length,2,"stale results must not start additional requests");
 assert.doesNotMatch(x.node("#globalSuggestions").innerHTML,/OLD/);
});
test("leaving global search clears query, results and pending response",async()=>{
 const pending=[];
 const x=boot({},false,url=>new Promise(resolve=>pending.push(resolve)));
 x.node("#globalSearch").value="AMAT";
 x.node("#globalSuggestions").innerHTML='<button>Old result</button>';
 const request=vm.runInContext("globalSearch()",x.context);
 x.node("#searchBack").handlers.click();
 assert.equal(x.node("#globalSearch").value,"");
 assert.equal(x.node("#globalSuggestions").innerHTML,"");
 pending.forEach(resolve=>resolve({ok:true,json:async()=>({results:[{symbol:"AMAT",name:"Applied Materials"}]})}));
 await request;
 assert.equal(x.node("#globalSuggestions").innerHTML,"");
});

test("closing and reopening add dialog while quote is pending never saves stale holding",async()=>{
 let releaseQuote;
 const x=boot({},false,url=>url.startsWith("/api/quote")?
   new Promise(resolve=>{releaseQuote=resolve}):
   Promise.resolve({ok:true,json:async()=>({items:[]})}));
 x.node("#symbol").value="AMAT";x.node("#market").value="US";
 x.node("#name").value="AMAT";x.node("#shares").value="2";x.node("#purchasePrice").value="100";
 x.node("#addDialog").open=true;
 const pending=x.node("#addForm").handlers.submit({preventDefault(){},target:{reset(){}}});
 assert.equal(typeof releaseQuote,"function");
 x.node("#addDialog").open=false;
 x.node("#addDialog").handlers.close();
 x.node("#addDialog").open=true;
 releaseQuote({ok:true,json:async()=>({priceJPY:200,dayChangePct:1})});
 await pending;
 assert.equal(x.stocks().length,0);
 assert.equal(x.map.has(KEY),false,"cancelled request must not touch portfolio storage");
});
test("rapid double submit while quote is pending adds one holding",async()=>{
 let releaseQuote,requests=0;
 const x=boot({},false,url=>url.startsWith("/api/quote")?
   (requests++,new Promise(resolve=>{releaseQuote=resolve})):
   Promise.resolve({ok:true,json:async()=>({items:[]})}));
 x.node("#symbol").value="AMAT";x.node("#market").value="US";
 x.node("#name").value="AMAT";x.node("#shares").value="2";x.node("#purchasePrice").value="100";
 x.node("#addDialog").open=true;
 const event={preventDefault(){},target:{reset(){}}};
 const first=x.node("#addForm").handlers.submit(event);
 const second=x.node("#addForm").handlers.submit(event);
 assert.equal(requests,1,"only one quote request may run for the same submission");
 releaseQuote({ok:true,json:async()=>({priceJPY:200,dayChangePct:1})});
 await Promise.all([first,second]);
 assert.equal(x.stocks().length,1);
 assert.equal(JSON.parse(x.map.get(KEY)).length,1);
});
test("editing the selected name cancels an in-flight add submission",async()=>{
 let releaseQuote;
 const x=boot({},false,url=>url.startsWith("/api/quote")?
   new Promise(resolve=>{releaseQuote=resolve}):
   Promise.resolve({ok:true,json:async()=>({items:[]})}));
 x.node("#symbol").value="AMAT";x.node("#market").value="US";
 x.node("#name").value="AMAT";x.node("#shares").value="2";x.node("#purchasePrice").value="100";
 x.node("#addDialog").open=true;
 const pending=x.node("#addForm").handlers.submit({preventDefault(){},target:{reset(){}}});
 x.node("#name").value="MSFT";x.node("#name").handlers.input();
 releaseQuote({ok:true,json:async()=>({priceJPY:200,dayChangePct:1})});
 await pending;
 assert.equal(x.stocks().length,0);
 assert.equal(x.map.has(KEY),false);
});

test("editing purchase details while a quote is pending never saves a stale snapshot",async()=>{
 for(const [field,newValue] of [["#purchasePrice","150"],["#shares","3"],["#memo","updated"]]){
  let releaseQuote;
  const x=boot({},false,url=>url.startsWith("/api/quote")?
   new Promise(resolve=>{releaseQuote=resolve}):
   Promise.resolve({ok:true,json:async()=>({items:[]})}));
  x.node("#symbol").value="AMAT";x.node("#market").value="US";
  x.node("#name").value="AMAT";x.node("#shares").value="2";
  x.node("#purchasePrice").value="100";x.node("#memo").value="original";
  x.node("#addDialog").open=true;
  const pending=x.node("#addForm").handlers.submit({preventDefault(){},target:{reset(){}}});
  x.node(field).value=newValue;
  x.node(field).handlers.input();
  releaseQuote({ok:true,json:async()=>({priceJPY:200,dayChangePct:1})});
  await pending;
  assert.equal(x.stocks().length,0,field+" must cancel pending quote snapshot");
  assert.equal(x.map.has(KEY),false,field+" must not write holdings");
 }
});
test("editing shares and resubmitting keeps only the new quote submission",async()=>{
 const quotes=[];
 const x=boot({},false,url=>url.startsWith("/api/quote")?
  new Promise(resolve=>quotes.push(resolve)):
  Promise.resolve({ok:true,json:async()=>({items:[]})}));
 x.node("#symbol").value="AMAT";x.node("#market").value="US";
 x.node("#name").value="AMAT";x.node("#shares").value="2";
 x.node("#purchasePrice").value="100";x.node("#addDialog").open=true;
 const event={preventDefault(){},target:{reset(){}}};
 const old=x.node("#addForm").handlers.submit(event);
 x.node("#shares").value="3";x.node("#shares").handlers.input();
 const current=x.node("#addForm").handlers.submit(event);
 assert.equal(quotes.length,2,"resubmission should start a fresh quote request");
 quotes[1]({ok:true,json:async()=>({priceJPY:250,dayChangePct:1})});
 await current;
 quotes[0]({ok:true,json:async()=>({priceJPY:200,dayChangePct:1})});
 await old;
 assert.equal(x.stocks().length,1);
 assert.equal(x.stocks()[0].shares,3);
 assert.equal(x.stocks()[0].currentPriceJPY,250);
 assert.equal(JSON.parse(x.map.get(KEY)).length,1);
});

test("leaving global search while a quote is pending does not reopen stale detail",async()=>{
 let releaseQuote;
 const x=boot({},false,url=>url.startsWith("/api/quote")?
  new Promise(resolve=>{releaseQuote=resolve}):
  Promise.resolve({ok:true,json:async()=>({items:[]})}));
 x.node("#openSearch").handlers.click();
 const result={dataset:{market:"US",name:"Applied Materials",symbol:"AMAT"}};
 const pending=x.node("#globalSuggestions").handlers.click({target:{closest:()=>result}});
 assert.equal(typeof releaseQuote,"function");
 x.node("#searchBack").handlers.click();
 releaseQuote({ok:true,json:async()=>({priceJPY:200,dayChangePct:1})});
 await pending;
 assert.equal(x.node("#homeView").hidden,false);
 assert.equal(x.node("#searchView").hidden,true);
 assert.equal(x.node("#detailView").hidden,true);
 assert.equal(x.alerts.length,0);
 assert.equal(x.map.has(KEY),false);
});
test("editing global search during a pending detail quote cancels old navigation",async()=>{
 let releaseQuote;
 const x=boot({},false,url=>url.startsWith("/api/quote")?
  new Promise(resolve=>{releaseQuote=resolve}):
  Promise.resolve({ok:true,json:async()=>({items:[]})}));
 x.node("#openSearch").handlers.click();
 const result={dataset:{market:"US",name:"Applied Materials",symbol:"AMAT"}};
 const pending=x.node("#globalSuggestions").handlers.click({target:{closest:()=>result}});
 x.node("#globalSearch").value="MSFT";
 x.node("#globalSearch").handlers.input();
 releaseQuote({ok:true,json:async()=>({priceJPY:200,dayChangePct:1})});
 await pending;
 assert.equal(x.node("#searchView").hidden,false);
 assert.equal(x.node("#detailView").hidden,true);
 assert.equal(x.node("#globalSearch").value,"MSFT");
 assert.equal(x.map.has(KEY),false);
});

test("a quote refresh never overwrites a portfolio edit made while the request is pending",async()=>{
 let releaseQuote;
 const original=JSON.stringify([holding]);
 const x=boot({[KEY]:original},false,url=>url.startsWith("/api/quote")?
  new Promise(resolve=>{releaseQuote=resolve}):
  Promise.resolve({ok:true,json:async()=>({items:[]})}));
 const pending=vm.runInContext("refreshAll()",x.context);
 assert.equal(typeof releaseQuote,"function");
 x.node("#editIndex").value="0";
 x.node("#editPurchasePrice").value="100";
 x.node("#editShares").value="5";
 x.node("#editPurchaseDate").value="";
 x.node("#editMemo").value="edited while loading";
 x.node("#editForm").handlers.submit({preventDefault(){}});
 assert.equal(JSON.parse(x.map.get(KEY))[0].shares,5);
 releaseQuote({ok:true,json:async()=>({priceJPY:350,dayChangePct:2})});
 await pending;
 assert.equal(x.stocks()[0].shares,5);
 assert.equal(x.stocks()[0].currentPriceJPY,200,"late quote must not alter the edited holding");
 assert.equal(JSON.parse(x.map.get(KEY))[0].currentPriceJPY,200);
 assert.equal(x.map.get(BACKUP),original,"late quote must not rotate the recovery backup");
 assert.match(x.node("#status").textContent,/古い株価の保存を中止/);
});

test("a quote refresh never resurrects a holding deleted during the request",async()=>{
 let releaseQuote;
 const original=JSON.stringify([holding]);
 const x=boot({[KEY]:original},false,url=>url.startsWith("/api/quote")?
  new Promise(resolve=>{releaseQuote=resolve}):
  Promise.resolve({ok:true,json:async()=>({items:[]})}));
 const pending=vm.runInContext("refreshAll()",x.context);
 x.node("#list").handlers.click({target:{closest:selector=>
  selector==="[data-del]"?{dataset:{del:"0"}}:null}});
 assert.equal(x.map.get(KEY),"[]");
 releaseQuote({ok:true,json:async()=>({priceJPY:350,dayChangePct:2})});
 await pending;
 assert.equal(x.stocks().length,0);
 assert.equal(x.map.get(KEY),"[]");
 assert.equal(x.map.get(BACKUP),original,"deletion recovery point must survive a stale refresh");
});

test("a failed quote save rolls back unsaved in-memory prices and keeps backups",async()=>{
 const older={...holding,symbol:"OLD",name:"Older recovery"};
 const primary=JSON.stringify([holding]),backup=JSON.stringify([older]);
 const x=boot({[KEY]:primary,[BACKUP]:backup},true,async url=>({
  ok:true,json:async()=>url.startsWith("/api/quote")?
   {priceJPY:350,dayChangePct:2}:{items:[]}
 }));
 await vm.runInContext("refreshAll()",x.context);
 assert.equal(x.stocks()[0].currentPriceJPY,200,"unsaved quote must not be shown as persisted");
 assert.equal(x.map.get(KEY),primary);
 assert.equal(x.map.get(BACKUP),backup);
 assert.match(x.node("#status").textContent,/保存できませんでした/);
});
