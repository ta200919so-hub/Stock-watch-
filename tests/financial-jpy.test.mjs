import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../api/fundamentals.js",import.meta.url),"utf8");
function run({currency="EUR",fx=180,market="US",currencyMissing=false,symbol="ASML",fallbackFx=null,targetPrice=null,fxQuoteCurrency="JPY"}={}){
 const requests=[];
 const series=["quarterlyTotalRevenue","quarterlyOperatingIncome"].map((type,i)=>({
  meta:{type:[type]},
  [type]:[{currencyCode:currencyMissing?undefined:currency,reportedValue:{raw:i?5173000000:11662000000}}]
 }));
 const fetch=async url=>{
  requests.push(url);
  if(url.includes("fundamentals-timeseries"))return {ok:true,json:async()=>({timeseries:{result:series}})};
  if(url.includes("quoteSummary"))return targetPrice===null?{ok:false,status:403}:{ok:true,json:async()=>({quoteSummary:{result:[{financialData:{targetMeanPrice:{raw:targetPrice}}}]}})};
  if(url.includes("api.frankfurter.dev"))return {ok:fallbackFx!==null,status:503,json:async()=>({date:"2026-10-23",rates:{JPY:fallbackFx}})};
  if(url.includes("finance/chart/")){
   const isFx=url.includes("EURJPY%3DX")||url.includes("EURJPY=X")||url.includes("JPY%3DX")||url.includes("JPY=X");
   return {ok:isFx&&fx!==null,status:404,json:async()=>({chart:{result:[{meta:{regularMarketPrice:fx,regularMarketTime:1792886400,currency:isFx?fxQuoteCurrency:currency}}]}})};
  }
  throw Error("unexpected "+url);
 };
 const context={fetch,URL,Date,Number,Math,Set,String,encodeURIComponent};
 vm.createContext(context);
 const handler=vm.runInContext(source.replace("export default async function handler","async function handler")+"\nhandler",context);
 const res={statusCode:0,status(code){this.statusCode=code;return this},setHeader(){},json(x){this.body=x;return this}};
 return handler({query:{symbol,market}},res).then(()=>({body:res.body,requests}));
}
test("EUR quarterly results are converted to yen using EURJPY, not stock trading USD",async()=>{
 const {body,requests}=await run();
 assert.equal(body.quarterFinancialCurrency,"EUR");
 assert.equal(body.quarterFxRateJPY,180);
 assert.equal(body.quarterRevenueJPY,11662000000*180);
 assert.equal(body.quarterOperatingIncomeJPY,5173000000*180);
 assert.ok(requests.some(x=>x.includes("EURJPY")));
});
test("unavailable FX must not silently report euro figures as yen",async()=>{
 const {body}=await run({fx:null});
 assert.equal(body.quarterRevenueJPY,null);
 assert.equal(body.quarterOperatingIncomeJPY,null);
 assert.equal(body.quarterFxRateJPY,null);
});
test("unknown reporting currency must not guess USD from the US market",async()=>{
 const {body}=await run({currencyMissing:true,symbol:"MSFT"});
 assert.equal(body.quarterFinancialCurrency,null);
 assert.equal(body.quarterRevenueJPY,null);
 assert.equal(body.quarterOperatingIncomeJPY,null);
});
test("JPY reporting currency uses rate one without an FX request",async()=>{
 const {body,requests}=await run({currency:"JPY",market:"JP"});
 assert.equal(body.quarterRevenueJPY,11662000000);
 assert.equal(body.quarterOperatingIncomeJPY,5173000000);
 assert.equal(body.quarterFxRateJPY,1);
 assert.ok(!requests.some(x=>x.includes("JPY=X")));
});

test("ASML missing currency metadata still uses verified EUR reporting currency",async()=>{
 const {body}=await run({currencyMissing:true});
 assert.equal(body.quarterFinancialCurrency,"EUR");
 assert.equal(body.quarterRevenueJPY,11662000000*180);
 assert.equal(body.quarterOperatingIncomeJPY,5173000000*180);
});
test("ASML converts with ECB fallback when Yahoo FX is unavailable",async()=>{
 const {body,requests}=await run({currencyMissing:true,fx:null,fallbackFx:182.5});
 assert.equal(body.quarterRevenueJPY,11662000000*182.5);
 assert.equal(body.quarterOperatingIncomeJPY,5173000000*182.5);
 assert.equal(body.quarterFxDate,"2026-10-23");
 assert.ok(requests.some(x=>x.includes("api.frankfurter.dev")));
});

test("US analyst target is converted to yen with a verified positive USD/JPY rate",async()=>{
 const {body}=await run({targetPrice:200,fx:180});
 assert.equal(body.targetMeanPrice,200);
 assert.equal(body.targetMeanPriceJPY,36000);
});
test("missing USD/JPY must not display an invented zero-yen analyst target",async()=>{
 const {body}=await run({targetPrice:200,fx:null});
 assert.equal(body.targetMeanPrice,200);
 assert.equal(body.targetMeanPriceJPY,null);
});
test("negative or non-finite USD/JPY cannot produce a yen analyst target",async()=>{
 for(const fx of [-10,0,Infinity,NaN]){
  const {body}=await run({targetPrice:200,fx});
  assert.equal(body.targetMeanPriceJPY,null,String(fx));
 }
});
test("Japanese analyst target is already yen and needs no FX request",async()=>{
 const {body,requests}=await run({market:"JP",currency:"JPY",targetPrice:1200,fx:null});
 assert.equal(body.targetMeanPriceJPY,1200);
 assert.ok(!requests.some(x=>x.includes("JPY=X")||x.includes("JPY%3DX")));
});
test("zero or negative analyst targets are not reported as valid yen prices",async()=>{
 for(const targetPrice of [0,-5]){
  const {body}=await run({market:"JP",currency:"JPY",targetPrice});
  assert.equal(body.targetMeanPriceJPY,null,String(targetPrice));
 }
});

test("FX quote in the wrong currency cannot silently convert US analyst targets",async()=>{
 const {body}=await run({targetPrice:200,fx:180,fxQuoteCurrency:"USD"});
 assert.equal(body.targetMeanPrice,200);
 assert.equal(body.targetMeanPriceJPY,null);
 assert.equal(body.quarterRevenueJPY,null);
 assert.equal(body.quarterOperatingIncomeJPY,null);
});
test("financial FX falls back to an independently quoted JPY rate on currency mismatch",async()=>{
 const {body,requests}=await run({currencyMissing:true,fx:180,fxQuoteCurrency:"USD",fallbackFx:182.5});
 assert.equal(body.quarterFxRateJPY,182.5);
 assert.equal(body.quarterRevenueJPY,11662000000*182.5);
 assert.equal(body.quarterOperatingIncomeJPY,5173000000*182.5);
 assert.ok(requests.some(x=>x.includes("api.frankfurter.dev")));
});
