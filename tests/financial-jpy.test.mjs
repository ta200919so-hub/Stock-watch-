import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../api/fundamentals.js",import.meta.url),"utf8");
function run({currency="EUR",fx=180,market="US",currencyMissing=false}={}){
 const requests=[];
 const series=["quarterlyTotalRevenue","quarterlyOperatingIncome"].map((type,i)=>({
  meta:{type:[type]},
  [type]:[{currencyCode:currencyMissing?undefined:currency,reportedValue:{raw:i?5173000000:11662000000}}]
 }));
 const fetch=async url=>{
  requests.push(url);
  if(url.includes("fundamentals-timeseries"))return {ok:true,json:async()=>({timeseries:{result:series}})};
  if(url.includes("quoteSummary"))return {ok:false,status:403};
  if(url.includes("finance/chart/")){
   const isFx=url.includes("EURJPY%3DX")||url.includes("EURJPY=X")||url.includes("JPY%3DX")||url.includes("JPY=X");
   return {ok:isFx&&fx!==null,status:404,json:async()=>({chart:{result:[{meta:{regularMarketPrice:fx,regularMarketTime:1792886400}}]}})};
  }
  throw Error("unexpected "+url);
 };
 const context={fetch,URL,Date,Number,Math,Set,String,encodeURIComponent};
 vm.createContext(context);
 const handler=vm.runInContext(source.replace("export default async function handler","async function handler")+"\nhandler",context);
 const res={statusCode:0,status(code){this.statusCode=code;return this},setHeader(){},json(x){this.body=x;return this}};
 return handler({query:{symbol:"ASML",market}},res).then(()=>({body:res.body,requests}));
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
 const {body}=await run({currencyMissing:true});
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
