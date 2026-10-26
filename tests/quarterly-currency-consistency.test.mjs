import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../api/fundamentals.js",import.meta.url),"utf8");
const entry=(date,raw,currencyCode)=>({asOfDate:date,reportedValue:{raw},currencyCode});
async function run(revenue,operating=[]){
 const requests=[];
 const rows=[{quarterlyTotalRevenue:revenue},{quarterlyOperatingIncome:operating}];
 const fetch=async url=>{
  requests.push(url);
  if(url.includes("fundamentals-timeseries"))return {ok:true,json:async()=>({timeseries:{result:rows}})};
  if(url.includes("EURJPY"))return {ok:true,json:async()=>({chart:{result:[{meta:{regularMarketPrice:180,currency:"JPY",regularMarketTime:1792886400}}]}})};
  return {ok:false,status:403};
 };
 const context=vm.createContext({fetch,Date,Number,Math,Set,String,encodeURIComponent});
 const handler=vm.runInContext(source.replace("export default async function handler","async function handler")+"\nhandler",context);
 const res={status(code){this.statusCode=code;return this},setHeader(){},json(body){this.body=body;return this}};
 await handler({query:{symbol:"7203.T",market:"JP"}},res);
 assert.equal(res.statusCode,200);
 return {body:res.body,requests};
}

test("mixed currency codes within quarterly revenue do not produce a fabricated yen amount",async()=>{
 const {body,requests}=await run([entry("2025-03-31",100,"USD"),entry("2026-03-31",150,"EUR")]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterFinancialCurrency,null);
 assert.equal(body.quarterFxRateJPY,null);
 assert.equal(body.quarterRevenueJPY,null);
 assert.equal(requests.filter(url=>url.includes("EURJPY")||url.includes("USDJPY")||url.includes("JPY=X")||url.includes("JPY%3DX")).length,0);
});

test("invalid explicit reporting currency cannot fall back to market JPY",async()=>{
 const {body}=await run([entry("2026-03-31",150,"US$")]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterFinancialCurrency,null);
 assert.equal(body.quarterRevenueJPY,null);
});

test("consistent EUR quarterly series still converts latest values correctly",async()=>{
 const {body}=await run(
  [entry("2026-03-31",150,"EUR"),entry("2025-03-31",100,"EUR")],
  [entry("2026-03-31",20,"EUR")]
 );
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterFinancialCurrency,"EUR");
 assert.equal(body.quarterFxRateJPY,180);
 assert.equal(body.quarterRevenueJPY,27000);
 assert.equal(body.quarterOperatingIncomeJPY,3600);
});

test("conflicting currency fields inside one observation block conversion",async()=>{
 const observation=entry("2026-03-31",150,"EUR");
 observation.reportedValue.currencyCode="USD";
 const {body}=await run([observation]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterFinancialCurrency,null);
 assert.equal(body.quarterRevenueJPY,null);
});

test("unlabeled operating income must not inherit revenue's EUR conversion",async()=>{
 const {body}=await run(
  [entry("2026-03-31",150,"EUR")],
  [entry("2026-03-31",20)]
 );
 assert.equal(body.quarterFinancialCurrency,"EUR");
 assert.equal(body.quarterRevenueJPY,27000);
 assert.equal(body.quarterOperatingIncomeJPY,null);
});

test("unlabeled revenue must not inherit operating income's EUR conversion",async()=>{
 const {body}=await run(
  [entry("2026-03-31",150)],
  [entry("2026-03-31",20,"EUR")]
 );
 assert.equal(body.quarterFinancialCurrency,"EUR");
 assert.equal(body.quarterRevenueJPY,null);
 assert.equal(body.quarterOperatingIncomeJPY,3600);
});

test("fully unlabeled Japanese quarterly series retain JPY market fallback",async()=>{
 const {body}=await run(
  [entry("2026-03-31",150)],
  [entry("2026-03-31",20)]
 );
 assert.equal(body.quarterFinancialCurrency,"JPY");
 assert.equal(body.quarterFxRateJPY,1);
 assert.equal(body.quarterRevenueJPY,150);
 assert.equal(body.quarterOperatingIncomeJPY,20);
});

test("latest unlabeled quarter cannot inherit an older EUR reporting currency",async()=>{
 const {body,requests}=await run([
  entry("2026-03-31",150),
  entry("2025-03-31",100,"EUR")
 ]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterFinancialCurrency,null);
 assert.equal(body.quarterFxRateJPY,null);
 assert.equal(body.quarterRevenueJPY,null);
 assert.equal(requests.some(url=>url.includes("EURJPY")),false);
});

test("latest dated EUR quarter can convert despite an older unlabeled observation",async()=>{
 const {body}=await run([
  entry("2025-03-31",100),
  entry("2026-03-31",150,"EUR")
 ]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterFinancialCurrency,"EUR");
 assert.equal(body.quarterRevenueJPY,27000);
});
