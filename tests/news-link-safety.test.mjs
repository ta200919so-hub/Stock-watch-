import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const APP=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const KEY="stock-watch-ai-v1";
function element(){
  return {value:"",textContent:"",innerHTML:"",hidden:false,open:false,dataset:{},style:{},isConnected:true,
    classList:{add(){},remove(){},toggle(){}},
    addEventListener(){},showModal(){this.open=true},close(){this.open=false},
    focus(){},prepend(child){this.child=child;child.isConnected=true},
    querySelector(){return element()},querySelectorAll(){return []}};
}
function boot(news){
  const holding={symbol:"TEST",name:"Test",market:"US",shares:1,purchasePriceJPY:100,currentPriceJPY:120,news};
  const original=JSON.stringify([holding]);
  const map=new Map([[KEY,original]]),nodes=new Map();
  const document={querySelector(key){if(!nodes.has(key))nodes.set(key,element());return nodes.get(key)},
    querySelectorAll(){return []},createElement(){return element()}};
  const localStorage={getItem(key){return map.get(key)??null},setItem(key,value){map.set(key,String(value))},removeItem(key){map.delete(key)}};
  const context={document,localStorage,navigator:{},window:{scrollTo(){}},URL,
    fetch:async()=>({ok:false}),setTimeout(){},clearTimeout(){},alert(){},confirm(){return true},
    console:{warn(){},error(){}},AbortController,Intl,Date,Number,Math,Set,Promise,JSON,Array,String};
  vm.createContext(context);
  vm.runInContext(APP,context,{filename:"app.js"});
  vm.runInContext("renderDetail(0)",context);
  return {html:document.querySelector("#detailBody").innerHTML,map,original};
}
test("news cards reject javascript and data URLs and untrusted impact classes",()=>{
  const {html,map,original}=boot([
    {url:"javascript:alert(1)",impact:'positive" onclick="alert(2)',title:"Unsafe",reason:"test"},
    {url:"data:text/html,<script>alert(1)</script>",impact:"negative",title:"Data",reason:"test"}
  ]);
  assert.equal((html.match(/href="#"/g)||[]).length,2);
  assert.doesNotMatch(html,/href="javascript:|href="data:/);
  assert.doesNotMatch(html,/onclick=/);
  assert.match(html,/class="impact neutral"/);
  assert.match(html,/class="impact negative"/);
  assert.equal(map.get(KEY),original,"rendering news must never mutate portfolio storage");
});
test("legitimate HTTPS news links and escaped text remain available",()=>{
  const {html}=boot([{url:"https://example.com/story?a=1&b=2",impact:"positive",title:"A < B",reason:"safe"}]);
  assert.match(html,/href="https:\/\/example\.com\/story\?a=1&amp;b=2"/);
  assert.match(html,/class="impact positive"/);
  assert.match(html,/A &lt; B/);
});

test("malformed saved news entries cannot crash stock detail or rewrite holdings",()=>{
  const news=[null,42,"unexpected",{url:"https://example.com/valid",impact:"neutral",title:"Valid",reason:"OK"}];
  const {html,map,original}=boot(news);
  assert.match(html,/Valid/);
  assert.equal((html.match(/class="news-item"/g)||[]).length,1);
  assert.equal(map.get(KEY),original,"malformed news must not mutate saved holdings");
});
test("non-array legacy news falls back to a safe empty state",()=>{
  const {html,map,original}=boot("corrupted news payload");
  assert.match(html,/ニュースデータ待ち/);
  assert.equal(map.get(KEY),original);
});
