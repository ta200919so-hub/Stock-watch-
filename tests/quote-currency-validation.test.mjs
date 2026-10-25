import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const SOURCE=readFileSync(new URL("../api/quote.js",import.meta.url),"utf8");
function response(){
  return {code:0,headers:{},body:null,
    status(code){this.code=code;return this},
    setHeader(key,value){this.headers[key]=value},
    json(body){this.body=body;return this}};
}
async function quote({symbol="7203.T",market="JP",stock={regularMarketPrice:3000,chartPreviousClose:2900,currency:"JPY"},fx={regularMarketPrice:150,currency:"JPY"}}={}){
  const requested=[];
  const fetch=async url=>{
    requested.push(url);
    return {ok:true,json:async()=>({chart:{result:[{meta:url.includes("JPY%3DX")?fx:stock}]}})};
  };
  const handler=vm.runInNewContext(SOURCE.replace("export default async function handler","async function handler")+"\nhandler",
    {fetch,Number,String,Error,encodeURIComponent});
  const res=response();
  await handler({query:{symbol,market}},res);
  return {res,requested};
}
test("JPY quote remains in yen without fetching FX",async()=>{
  const {res,requested}=await quote();
  assert.equal(res.code,200);
  assert.equal(res.body.priceJPY,3000);
  assert.equal(res.body.dayChangePct,100/2900*100);
  assert.equal(requested.length,1);
});
test("USD quote converts only with a valid JPY FX rate",async()=>{
  const {res,requested}=await quote({symbol:"amat",market:"US",
    stock:{regularMarketPrice:200,chartPreviousClose:190,currency:"USD"}});
  assert.equal(res.code,200);
  assert.equal(res.body.symbol,"AMAT");
  assert.equal(res.body.priceJPY,30000);
  assert.equal(res.body.fx,150);
  assert.equal(requested.length,2);
});
test("wrong or unknown trading currency cannot silently enter yen valuations",async()=>{
  for(const [market,currency] of [["JP","USD"],["US","JPY"],["JP",undefined],["US","EUR"]]){
    const {res,requested}=await quote({market,stock:{regularMarketPrice:100,currency}});
    assert.equal(res.code,502,market+" / "+currency);
    assert.equal(requested.length,1);
  }
});
test("invalid stock and FX numbers are rejected rather than serialized as null",async()=>{
  for(const price of [Infinity,NaN,-2,0]){
    const {res}=await quote({stock:{regularMarketPrice:price,currency:"JPY"}});
    assert.equal(res.code,502,String(price));
  }
  for(const rate of [Infinity,NaN,-1,0]){
    const {res}=await quote({market:"US",stock:{regularMarketPrice:100,currency:"USD"},
      fx:{regularMarketPrice:rate,currency:"JPY"}});
    assert.equal(res.code,502,String(rate));
  }
  const {res}=await quote({market:"US",stock:{regularMarketPrice:100,currency:"USD"},
    fx:{regularMarketPrice:150,currency:"USD"}});
  assert.equal(res.code,502,"FX currency must be JPY");
});
test("invalid market or symbol is rejected before an upstream request",async()=>{
  for(const input of [{market:"EUR"},{symbol:"../../foo"},{symbol:""}]){
    const {res,requested}=await quote(input);
    assert.equal(res.code,400);
    assert.equal(requested.length,0);
  }
});
test("invalid previous close does not produce bogus day change",async()=>{
  const {res}=await quote({stock:{regularMarketPrice:100,chartPreviousClose:-1,currency:"JPY"}});
  assert.equal(res.code,200);
  assert.equal(res.body.previousClose,null);
  assert.equal(res.body.dayChangePct,null);
});
