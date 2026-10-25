import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../api/history.js",import.meta.url),"utf8");
const time=date=>Math.floor(new Date(date+"T00:00:00Z").getTime()/1000);
function makeChart(entries,currency){
 return {chart:{result:[{
  timestamp:entries.map(([date])=>time(date)),
  indicators:{quote:[{close:entries.map(([,price])=>price)}]},
  meta:{currency}
 }]}};
}
async function run({market="US",stock=[
 ["2026-10-19",100],["2026-10-20",110],["2026-10-21",120]
],fx=[
 ["2026-10-20",150],["2026-10-21",151]
],stockCurrency=market==="US"?"USD":"JPY",fxCurrency="JPY"}={}){
 const requests=[];
 const fetch=async url=>{
  requests.push(url);
  const isFx=url.includes("JPY%3DX");
  return {ok:true,json:async()=>makeChart(isFx?fx:stock,isFx?fxCurrency:stockCurrency)};
 };
 const context={fetch,Date,Number,Math,Map,Set,String,encodeURIComponent};
 vm.createContext(context);
 const handler=vm.runInContext(source.replace("export default async function handler","async function handler")+"\\nhandler".replace("\\n","\n"),context);
 const res={statusCode:0,status(code){this.statusCode=code;return this},setHeader(){},json(body){this.body=body;return this}};
 await handler({query:{symbol:market==="US"?"NVDA":"7203.T",market,range:"1mo"}},res);
 return {status:res.statusCode,body:res.body,requests};
}
test("US chart drops only days without prior FX, never backfills a future rate",async()=>{
 const {status,body}=await run();
 assert.equal(status,200);
 assert.deepEqual(JSON.parse(JSON.stringify(body.points)),[
  {date:"2026-10-20",priceJPY:16500},
  {date:"2026-10-21",priceJPY:18120}
 ]);
});
test("FX from prior trading day carries forward over a missing FX day",async()=>{
 const {status,body}=await run({fx:[["2026-10-19",150],["2026-10-21",151]]});
 assert.equal(status,200);
 assert.deepEqual(Array.from(body.points,x=>x.priceJPY),[15000,16500,18120]);
});
test("insufficient overlapping FX dates fails instead of using future rates",async()=>{
 const {status,body}=await run({fx:[["2026-10-21",151]]});
 assert.equal(status,502);
 assert.equal(body.error,"history_unavailable");
});
test("invalid FX currency fails rather than reporting an incorrect yen chart",async()=>{
 const {status}=await run({fxCurrency:"USD"});
 assert.equal(status,502);
});
test("JPY chart requires no FX fetch and retains all trading dates",async()=>{
 const {status,body,requests}=await run({market:"JP"});
 assert.equal(status,200);
 assert.equal(body.points.length,3);
 assert.equal(body.points[0].priceJPY,100);
 assert.equal(requests.length,1);
});
