import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=source.indexOf("async function globalSearch(){");
const end=source.indexOf("\nasync function renderExternalDetail(",start);
assert.ok(start>=0&&end>start,"global search function exists");
const searchSource=source.slice(start,end);

function harness(fetchTimeout){
 const input={value:""},box={innerHTML:""},searchView={hidden:false};
 const elements={"#globalSearch":input,"#globalSuggestions":box,"#searchView":searchView};
 const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
 const context={fetchTimeout,$:s=>elements[s],escapeHtml,encodeURIComponent,Set,Array};
 vm.createContext(context);
 const api=vm.runInContext("let globalSearchRequestId=0;\n"+searchSource+"\n({search:globalSearch})",context);
 return {input,box,searchView,search:api.search};
}
const response=results=>({ok:true,json:async()=>({results})});

test("searches JP and US concurrently, with bounded requests and partial failure",async()=>{
 const pending=[];
 const h=harness((url,ms)=>new Promise((resolve,reject)=>pending.push({url,ms,resolve,reject})));
 h.input.value="ASML";
 const run=h.search();
 assert.equal(pending.length,2,"both markets start without waiting for the other");
 assert.ok(pending.every(x=>x.ms===7000),"each market has a timeout");
 assert.match(h.box.innerHTML,/検索中/);
 pending[0].reject(Error("JP unavailable"));
 pending[1].resolve(response([{symbol:"ASML",name:"ASML"}]));
 await run;
 assert.match(h.box.innerHTML,/ASML/);
 assert.match(h.box.innerHTML,/米国株/);
 assert.doesNotMatch(h.box.innerHTML,/候補が見つかりません/);
});
test("out-of-order results cannot replace a newer search",async()=>{
 const pending=[];
 const h=harness(url=>new Promise(resolve=>pending.push({url,resolve})));
 h.input.value="old";
 const old=h.search();
 h.input.value="new";
 const newer=h.search();
 assert.equal(pending.length,4);
 pending[2].resolve(response([{symbol:"7203.T",name:"トヨタ"}]));
 pending[3].resolve(response([]));
 await newer;
 const latest=h.box.innerHTML;
 assert.match(latest,/7203\.T/);
 pending[0].resolve(response([{symbol:"OLD",name:"Old"}]));
 pending[1].resolve(response([]));
 await old;
 assert.equal(h.box.innerHTML,latest);
});
test("hidden search view must not be repopulated after navigation",async()=>{
 const pending=[];
 const h=harness(url=>new Promise(resolve=>pending.push(resolve)));
 h.input.value="test";
 const run=h.search();
 h.searchView.hidden=true;
 pending.forEach(resolve=>resolve(response([{symbol:"AAPL",name:"Apple"}])));
 await run;
 assert.doesNotMatch(h.box.innerHTML,/AAPL/);
});
test("deduplicates market matches and escapes untrusted result text",async()=>{
 const h=harness(async url=>response([{symbol:"AAPL",name:"<script>"}]));
 h.input.value="apple";
 await h.search();
 assert.equal((h.box.innerHTML.match(/data-symbol="AAPL"/g)||[]).length,1);
 assert.match(h.box.innerHTML,/&lt;script&gt;/);
 assert.doesNotMatch(h.box.innerHTML,/<script>/);
});

test("fast US matches are tappable before the slower JP market finishes",async()=>{
 const pending=[];
 const h=harness((url,ms)=>new Promise(resolve=>pending.push({url,ms,resolve})));
 h.input.value="AMAT";
 const run=h.search();
 assert.equal(pending.length,2);
 pending[1].resolve(response([{symbol:"AMAT",name:"Applied Materials"}]));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.box.innerHTML,/data-symbol="AMAT"/);
 assert.match(h.box.innerHTML,/他の市場も検索中/);
 pending[0].resolve(response([{symbol:"7203.T",name:"トヨタ"}]));
 await run;
 assert.match(h.box.innerHTML,/data-symbol="AMAT"/);
 assert.match(h.box.innerHTML,/data-symbol="7203.T"/);
 assert.ok(h.box.innerHTML.indexOf("AMAT")<h.box.innerHTML.indexOf("7203.T"),"first result keeps its position");
 assert.doesNotMatch(h.box.innerHTML,/検索中/);
});
test("late partial responses from an older query never replace new results",async()=>{
 const pending=[];
 const h=harness(url=>new Promise(resolve=>pending.push({url,resolve})));
 h.input.value="old";
 const old=h.search();
 pending[1].resolve(response([{symbol:"OLD",name:"Old Company"}]));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(h.box.innerHTML,/OLD/);
 h.input.value="new";
 const newer=h.search();
 assert.doesNotMatch(h.box.innerHTML,/OLD/);
 pending[2].resolve(response([{symbol:"NEW",name:"New Company"}]));
 pending[3].resolve(response([]));
 await newer;
 pending[0].resolve(response([{symbol:"STALE",name:"Stale Company"}]));
 await old;
 assert.match(h.box.innerHTML,/NEW/);
 assert.doesNotMatch(h.box.innerHTML,/OLD|STALE/);
});
