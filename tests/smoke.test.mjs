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
  setItem(key,value){if(failPrimary&&key===KEY)throw Error("storage full");map.set(key,String(value))}};
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
 assert.equal(pending.length,1);
 x.node("#globalSuggestions").innerHTML='<button>OLD</button>';
 x.node("#globalSearch").value="new";
 x.node("#globalSearch").handlers.input();
 assert.equal(x.node("#globalSuggestions").innerHTML,"");
 pending[0].resolve({ok:true,json:async()=>({results:[{symbol:"OLD",name:"Old Company"}]})});
 await old;
 assert.equal(pending.length,1,"stale JP response must not trigger a second US request");
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
 pending[0]({ok:true,json:async()=>({results:[{symbol:"AMAT",name:"Applied Materials"}]})});
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
