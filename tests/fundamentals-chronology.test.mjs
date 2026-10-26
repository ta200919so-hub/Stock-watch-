import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../api/fundamentals.js",import.meta.url),"utf8");
const entry=(date,raw)=>({...date?{asOfDate:date}:{},currencyCode:"JPY",reportedValue:{raw}});
async function financials(revenues,incomes=[]){
 const rows=[
  {quarterlyTotalRevenue:revenues},
  {quarterlyOperatingIncome:incomes}
 ];
 const fetch=async url=>url.includes("fundamentals-timeseries")
  ?{ok:true,json:async()=>({timeseries:{result:rows}})}
  :{ok:false,status:403};
 const context=vm.createContext({fetch,Date,Number,Math,Set,String,encodeURIComponent});
 const handler=vm.runInContext(source.replace("export default async function handler","async function handler")+"\nhandler",context);
 const res={status(code){this.statusCode=code;return this},setHeader(){},json(body){this.body=body;return this}};
 await handler({query:{symbol:"7203.T",market:"JP"}},res);
 assert.equal(res.statusCode,200);
 return res.body;
}

test("out-of-order quarterly reports select the newest dated revenue and operating income",async()=>{
 const body=await financials([
  entry("2026-06-30",200),entry("2025-09-30",100),
  entry("2026-09-30",150),entry("2025-12-31",130)
 ],[entry("2026-09-30",60),entry("2025-09-30",30)]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterOperatingIncome,60);
 assert.equal(body.quarterRevenueJPY,150);
 assert.equal(body.quarterOperatingIncomeJPY,60);
 assert.equal(body.quarterRevenueGrowth,0.5);
 assert.equal(body.quarterOperatingIncomeGrowth,1);
});

test("missing year-earlier quarter does not produce a fabricated YoY comparison",async()=>{
 const body=await financials([
  entry("2024-03-31",70),entry("2024-06-30",80),
  entry("2025-06-30",100),entry("2025-12-31",120),
  entry("2026-09-30",200)
 ]);
 assert.equal(body.quarterRevenue,200);
 assert.equal(body.quarterRevenueGrowth,null);
});

test("legacy undated quarter arrays retain the existing five-quarter fallback",async()=>{
 const body=await financials([
  entry(null,100),entry(null,110),entry(null,120),
  entry(null,130),entry(null,150)
 ]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterRevenueGrowth,0.5);
});

test("malformed undated items cannot supersede dated quarterly reports",async()=>{
 const body=await financials([
  entry("2025-09-30",100),entry("2026-09-30",150),entry(null,999)
 ]);
 assert.equal(body.quarterRevenue,150);
 assert.equal(body.quarterRevenueGrowth,0.5);
});
