import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=source.indexOf("async function searchStocks(){");
const end=source.indexOf("\ndocument.querySelectorAll(\".filter\")",start);
assert.ok(start>=0&&end>start,"add-holding search function exists");
const snippet=source.slice(start,end);

function harness(fetchTimeout){
 const elements={
  "#name":{value:""},"#market":{value:"JP"},"#symbol":{value:"OLD"},
  "#selectedStock":{hidden:false},"#suggestions":{hidden:true,innerHTML:""}
 };
 const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
 const context={fetchTimeout,$:key=>elements[key],escapeHtml,encodeURIComponent,Array,String};
 vm.createContext(context);
 const api=vm.runInContext("let addSearchRequestId=0;\n"+snippet+"\n({search:searchStocks})",context);
 return {elements,search:api.search};
}
const response=results=>({ok:true,json:async()=>({results})});

test("add search starts immediately, shows loading and uses a seven-second bound",async()=>{
 const requests=[];
 const h=harness((url,ms)=>new Promise(resolve=>requests.push({url,ms,resolve})));
 h.elements["#name"].value="トヨタ";
 const run=h.search();
 assert.equal(requests.length,1);
 assert.equal(requests[0].ms,7000);
 assert.match(requests[0].url,/market=JP/);
 assert.match(h.elements["#suggestions"].innerHTML,/検索中/);
 assert.equal(h.elements["#suggestions"].hidden,false);
 assert.equal(h.elements["#symbol"].value,"");
 assert.equal(h.elements["#selectedStock"].hidden,true);
 requests[0].resolve(response([{symbol:"7203.T",name:"トヨタ自動車"}]));
 await run;
 assert.match(h.elements["#suggestions"].innerHTML,/7203\.T/);
});

test("failed and timed-out add searches show a retryable error instead of disappearing",async()=>{
 const h=harness(async()=>{throw Error("timeout")});
 h.elements["#name"].value="AAPL";
 await h.search();
 assert.equal(h.elements["#suggestions"].hidden,false);
 assert.match(h.elements["#suggestions"].innerHTML,/検索に失敗/);
});

test("stale success and stale failure never overwrite newer suggestions",async()=>{
 const pending=[];
 const h=harness(()=>new Promise((resolve,reject)=>pending.push({resolve,reject})));
 h.elements["#name"].value="old";
 const old=h.search();
 h.elements["#name"].value="new";
 const current=h.search();
 pending[1].resolve(response([{symbol:"MSFT",name:"Microsoft"}]));
 await current;
 const currentHtml=h.elements["#suggestions"].innerHTML;
 pending[0].reject(Error("timeout"));
 await old;
 assert.equal(h.elements["#suggestions"].innerHTML,currentHtml);
 assert.match(currentHtml,/MSFT/);
});

test("empty query clears stale suggestions and untrusted names are escaped",async()=>{
 const h=harness(async()=>response([{symbol:"AAPL",name:"<script>alert(1)</script>"}]));
 h.elements["#name"].value="Apple";
 await h.search();
 assert.match(h.elements["#suggestions"].innerHTML,/&lt;script&gt;/);
 assert.doesNotMatch(h.elements["#suggestions"].innerHTML,/<script>/);
 h.elements["#name"].value="";
 await h.search();
 assert.equal(h.elements["#suggestions"].hidden,true);
 assert.equal(h.elements["#suggestions"].innerHTML,"");
});
