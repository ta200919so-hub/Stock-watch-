import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../api/news.js",import.meta.url),"utf8");
async function run(payload,{upstreamOk=true}={}){
  const fetch=async()=>({ok:upstreamOk,json:async()=>payload});
  const handler=vm.runInNewContext(
    source.replace("export default async function handler","async function handler")+"\nhandler",
    {fetch,Number,String,Array,Error}
  );
  const res={
    code:null,headers:{},body:null,
    status(code){this.code=code;return this},
    setHeader(key,value){this.headers[key]=value},
    json(body){this.body=body;return this}
  };
  await handler({query:{symbol:"AMAT"}},res);
  return res;
}
test("missing or malformed upstream news arrays are outages, not empty feeds",async()=>{
  for(const payload of [{},null,{news:null},{news:{}},{news:"bad"}]){
    const res=await run(payload);
    assert.equal(res.code,200);
    assert.equal(res.body.unavailable,true);
    assert.deepEqual(Array.from(res.body.items),[]);
    assert.equal(res.headers["Cache-Control"],"no-store");
  }
});
test("nonempty upstream feeds with no usable headlines preserve prior news",async()=>{
  const res=await run({news:[null,{},{"title":""},{"title":42}]});
  assert.equal(res.body.unavailable,true);
  assert.equal(res.headers["Cache-Control"],"no-store");
});
test("genuine successful empty feed may clear old articles",async()=>{
  const res=await run({news:[]});
  assert.equal(res.code,200);
  assert.equal(res.body.unavailable,undefined);
  assert.equal(res.body.items.length,0);
  assert.match(res.headers["Cache-Control"],/s-maxage=600/);
});
test("partial malformed feed retains valid articles and safe metadata types",async()=>{
  const res=await run({news:[
    {title:"",link:"https://example.com/invalid"},
    {title:"Profit rises",link:{"bad":true},publisher:{"bad":true}},
    {title:"成長を発表",url:"https://example.com/news",publisher:"Publisher"}
  ]});
  assert.equal(res.code,200);
  assert.equal(res.body.items.length,2);
  assert.equal(res.body.items[0].title,"Profit rises");
  assert.equal(res.body.items[0].url,"");
  assert.equal(res.body.items[0].publisher,"Yahoo Finance");
  assert.equal(res.body.items[1].url,"https://example.com/news");
  assert.equal(res.body.items[1].publisher,"Publisher");
});
test("upstream HTTP failures return non-cacheable unavailable fallback",async()=>{
  const res=await run({news:[]},{upstreamOk:false});
  assert.equal(res.body.unavailable,true);
  assert.equal(res.headers["Cache-Control"],"no-store");
});
