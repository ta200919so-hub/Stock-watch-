import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=source.indexOf("async function refreshOne(s){");
const end=source.indexOf("\nasync function refreshAll()",start);
assert.ok(start>=0&&end>start,"refreshOne source must be found");
const helperStart=source.indexOf("function mergeFundamentals(previous,next){");
assert.ok(helperStart>=0&&helperStart<start,"fundamentals merge helper must be found");
const refreshCode=source.slice(helperStart,end);
const holding=()=>({
  symbol:"AMAT",market:"US",currentPriceJPY:100,dayChangePct:0,
  fundamentals:{trailingPE:22},news:[{title:"Existing news"}]
});
const reply=body=>({ok:true,json:async()=>body});
async function run(holdingData,{fundamentals,news}){
  const fetchTimeout=async url=>url.startsWith("/api/quote")?
    reply({priceJPY:120,dayChangePct:2}):
    url.startsWith("/api/fundamentals")?reply(fundamentals):reply(news);
  // Exercise the production news validator rather than a looser test-only stub.
  const helperLine=source.split("\n").find(line=>line.startsWith("const usableNewsItems="));
  const usableNewsItems=vm.runInNewContext(helperLine+"\nusableNewsItems",{Array});
  const context=vm.createContext({fetchTimeout,Number,Date,Promise,Array,usableNewsItems});
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
test("unavailable partial fundamentals do not replace previously saved complete metrics",async()=>{
  const s=holding(),oldFundamentals=s.fundamentals;
  await run(s,{fundamentals:{unavailable:true,quarterRevenueJPY:100000,source:[]},news:{items:[],unavailable:true}});
  assert.equal(s.fundamentals,oldFundamentals);
  assert.equal(s.fundamentals.trailingPE,22);
});

test("malformed HTTP 200 news articles do not erase saved headlines",async()=>{
  const s=holding(),previous=s.news;
  await run(s,{fundamentals:{unavailable:true},news:{items:[{},null,{title:""},{title:"   "},{title:42}]}});
  assert.equal(s.news,previous,"all-invalid news feed must retain existing saved articles");
});
test("mixed valid and malformed news articles keep only usable headlines",async()=>{
  const s=holding();
  await run(s,{fundamentals:{unavailable:true},news:{items:[{},{"title":"Fresh update"},{title:"   "},null]}});
  assert.deepEqual(s.news.map(item=>item.title),["Fresh update"]);
});

test("quarterly-only success preserves saved annual metrics instead of clearing them",async()=>{
  const s=holding();s.fundamentals={trailingPE:22,profitMargin:0.2,marketCap:1000000,quarterRevenue:400,quarterRevenueJPY:60000};
  await run(s,{fundamentals:{unavailable:false,trailingPE:null,profitMargin:null,marketCap:null,quarterRevenue:500,quarterRevenueJPY:75000,quarterOperatingIncome:80,quarterOperatingIncomeJPY:12000},news:{items:[]}});
  assert.equal(s.fundamentals.trailingPE,22);
  assert.equal(s.fundamentals.profitMargin,0.2);
  assert.equal(s.fundamentals.marketCap,1000000);
  assert.equal(s.fundamentals.quarterRevenue,500);
  assert.equal(s.fundamentals.quarterRevenueJPY,75000);
  assert.equal(s.fundamentals.quarterOperatingIncomeJPY,12000);
});
test("new raw quarter without FX clears stale yen amount but keeps unrelated metrics",async()=>{
  const s=holding();s.fundamentals={trailingPE:22,quarterRevenue:400,quarterRevenueJPY:60000,quarterRevenueGrowth:0.2};
  await run(s,{fundamentals:{unavailable:false,quarterRevenue:500,quarterRevenueJPY:null,quarterRevenueGrowth:null,quarterFinancialCurrency:null,quarterFxRateJPY:null},news:{items:[]}});
  assert.equal(s.fundamentals.trailingPE,22);
  assert.equal(s.fundamentals.quarterRevenue,500);
  assert.equal(s.fundamentals.quarterRevenueJPY,null);
  assert.equal(s.fundamentals.quarterRevenueGrowth,null);
});
test("partial metric refresh does not accept malformed non-finite fields",async()=>{
  const s=holding();s.fundamentals={trailingPE:22,marketCap:1000};
  await run(s,{fundamentals:{unavailable:false,marketCap:2000,trailingPE:Infinity},news:{items:[]}});
  assert.equal(s.fundamentals.trailingPE,22);
  assert.equal(s.fundamentals.marketCap,2000);
});
