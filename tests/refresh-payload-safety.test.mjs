import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=source.indexOf("async function refreshOne(s){");
const end=source.indexOf("\nasync function refreshAll()",start);
assert.ok(start>=0&&end>start,"refreshOne source must be found");
const refreshCode=source.slice(start,end);
const holding=()=>({
  symbol:"AMAT",market:"US",currentPriceJPY:100,dayChangePct:0,
  fundamentals:{trailingPE:22},news:[{title:"Existing news"}]
});
const reply=body=>({ok:true,json:async()=>body});
async function run(holdingData,{fundamentals,news}){
  const fetchTimeout=async url=>url.startsWith("/api/quote")?
    reply({priceJPY:120,dayChangePct:2}):
    url.startsWith("/api/fundamentals")?reply(fundamentals):reply(news);
  const context=vm.createContext({fetchTimeout,Number,Date,Promise,Array,
    usableNewsItems:value=>Array.isArray(value)?
      value.filter(n=>n&&typeof n==="object"&&!Array.isArray(n)):[]});
  const refreshOne=vm.runInContext(refreshCode+"\nrefreshOne",context);
  await refreshOne(holdingData);
}
test("malformed successful fundamentals and news payloads preserve saved analysis",async()=>{
  const s=holding(),oldFundamentals=s.fundamentals,oldNews=s.news;
  await run(s,{fundamentals:{error:"upstream"},news:{items:[null,"bad",42]}});
  assert.equal(s.currentPriceJPY,120,"valid quote still refreshes");
  assert.equal(s.fundamentals,oldFundamentals);
  assert.equal(s.news,oldNews);
});
test("array fundamentals and invalid news shape cannot erase saved analysis",async()=>{
  const s=holding(),oldFundamentals=s.fundamentals,oldNews=s.news;
  await run(s,{fundamentals:[],news:{items:"invalid"}});
  assert.equal(s.fundamentals,oldFundamentals);
  assert.equal(s.news,oldNews);
});
test("valid metrics and intentionally empty news are accepted",async()=>{
  const s=holding();
  await run(s,{fundamentals:{trailingPE:19},news:{items:[]}});
  assert.equal(s.fundamentals.trailingPE,19);
  assert.equal(s.news.length,0);
});
test("HTTP 200 upstream unavailable responses preserve saved metrics and news",async()=>{
  const s=holding(),oldFundamentals=s.fundamentals,oldNews=s.news;
  await run(s,{fundamentals:{unavailable:true,source:[]},news:{items:[],unavailable:true}});
  assert.equal(s.currentPriceJPY,120,"valid quote still refreshes");
  assert.equal(s.fundamentals,oldFundamentals);
  assert.equal(s.news,oldNews);
});
test("empty source and unavailable false do not validate an empty fundamentals response",async()=>{
  const s=holding(),oldFundamentals=s.fundamentals;
  await run(s,{fundamentals:{unavailable:false,source:[]},news:{items:[{title:"Fresh"}]}});
  assert.equal(s.fundamentals,oldFundamentals);
  assert.equal(s.news[0].title,"Fresh");
});
test("unavailable fundamentals can initialize an empty holding without erasing existing analysis",async()=>{
  const s=holding();s.fundamentals=null;
  await run(s,{fundamentals:{unavailable:true,source:[]},news:{items:[]}});
  assert.equal(s.fundamentals.unavailable,true);
});
test("valid fundamentals from a different numeric field still refresh",async()=>{
  const s=holding();
  await run(s,{fundamentals:{marketCap:1000000,unavailable:false},news:{items:[]}});
  assert.equal(s.fundamentals.marketCap,1000000);
});
