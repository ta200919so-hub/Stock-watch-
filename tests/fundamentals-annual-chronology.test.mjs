import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../api/fundamentals.js",import.meta.url),"utf8");
const v=(date,raw)=>({...date?{asOfDate:date}:{},reportedValue:{raw}});
async function run(rows){
 const fetch=async url=>url.includes("fundamentals-timeseries")?{ok:true,json:async()=>({timeseries:{result:rows}})}:{ok:false,status:403};
 const context=vm.createContext({fetch,Date,Number,Math,Set,String,encodeURIComponent});
 const handler=vm.runInContext(source.replace("export default async function handler","async function handler")+"\nhandler",context);
 const res={status(code){this.statusCode=code;return this},setHeader(){},json(body){this.body=body;return this}};
 await handler({query:{symbol:"7203.T",market:"JP"}},res);
 assert.equal(res.statusCode,200);return res.body;
}
test("unsorted dated annual reports select latest revenue, EPS and valuation",async()=>{
 const x=await run([
  {trailingPeRatio:[v("2026-09-30",15),v("2025-09-30",10)]},
  {annualTotalRevenue:[v("2026-03-31",150),v("2024-03-31",80),v("2025-03-31",100)]},
  {annualNetIncomeContinuousOperations:[v("2025-03-31",20),v("2026-03-31",30)]},
  {annualDilutedEPS:[v("2026-03-31",3),v("2024-03-31",1),v("2025-03-31",2)]}
 ]);
 assert.equal(x.trailingPE,15);assert.equal(x.revenueGrowth,0.5);
 assert.equal(x.profitMargin,0.2);assert.equal(x.earningsGrowth,0.5);
});
test("missing previous year and mismatched income do not fabricate metrics",async()=>{
 const x=await run([
  {annualTotalRevenue:[v("2024-03-31",80),v("2026-03-31",150)]},
  {annualNetIncomeContinuousOperations:[v("2025-03-31",30)]},
  {annualDilutedEPS:[v("2024-03-31",1),v("2026-03-31",3)]}
 ]);
 assert.equal(x.revenueGrowth,null);assert.equal(x.profitMargin,null);assert.equal(x.earningsGrowth,null);
});
test("undated annual series preserve legacy order",async()=>{
 const x=await run([
  {annualTotalRevenue:[v(null,100),v(null,150)]},
  {annualNetIncomeContinuousOperations:[v(null,10),v(null,30)]},
  {annualDilutedEPS:[v(null,2),v(null,3)]}
 ]);
 assert.equal(x.revenueGrowth,0.5);assert.equal(x.profitMargin,0.2);assert.equal(x.earningsGrowth,0.5);
});
test("undated outliers cannot override dated fiscal reports",async()=>{
 const x=await run([
  {annualTotalRevenue:[v("2025-03-31",100),v("2026-03-31",150),v(null,999)]},
  {annualNetIncomeContinuousOperations:[v("2026-03-31",30),v(null,999)]}
 ]);
 assert.equal(x.revenueGrowth,0.5);assert.equal(x.profitMargin,0.2);
});
