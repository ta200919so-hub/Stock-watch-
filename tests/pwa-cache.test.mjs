import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const SOURCE=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
function boot({ok=true,networkFails=false,putFails=false,path="/",type="text/html",redirected=false}={}){
  const listeners={},putCalls=[],cacheWrites=[];
  let releaseWrite;
  const waitForRelease=new Promise(resolve=>{releaseWrite=resolve});
  const cached={offline:true};
  const cache={addAll:async()=>{},put:async(key,value)=>{putCalls.push(key);await waitForRelease;if(putFails)throw Error("cache full");cacheWrites.push(value)},match:async()=>cached};
  const caches={open:async()=>cache,match:async()=>cached,keys:async()=>[],delete:async()=>true};
  const response={ok,redirected,headers:{get:()=>type},clone(){return {copy:true}}};
  const self={location:{href:"https://example.com/sw.js"},addEventListener:(type,fn)=>listeners[type]=fn,skipWaiting(){},clients:{claim:async()=>{}}};
  const fetch=async()=>{if(networkFails)throw Error("offline");return response};
  vm.runInNewContext(SOURCE,{self,caches,fetch,URL,Promise});
  const event={request:{url:"https://example.com"+path,mode:"navigate"},waits:[],waitUntil(p){this.waits.push(p)},respondWith(p){this.response=Promise.resolve(p)}};
  return {event,listeners,putCalls,cacheWrites,releaseWrite,response,cached};
}
test("navigation waits for cache write to finish",async()=>{
  const x=boot();x.listeners.fetch(x.event);
  assert.equal(await x.event.response,x.response);
  assert.equal(x.event.waits.length,1);
  assert.equal(x.cacheWrites.length,0);
  x.releaseWrite();await Promise.all(x.event.waits);
  assert.equal(x.cacheWrites.length,1);
});
test("non-OK navigation does not overwrite offline cache",async()=>{
  const x=boot({ok:false});x.listeners.fetch(x.event);
  assert.equal(await x.event.response,x.response);
  assert.equal(x.event.waits.length,1);
  x.releaseWrite();await Promise.all(x.event.waits);assert.equal(x.putCalls.length,0);
});
test("offline navigation uses cached page",async()=>{
  const x=boot({networkFails:true});x.listeners.fetch(x.event);
  assert.equal(await x.event.response,x.cached);
  assert.equal(x.event.waits.length,1);
  x.releaseWrite();await Promise.all(x.event.waits);
});
test("cache write failure does not fail response",async()=>{
  const x=boot({putFails:true});x.listeners.fetch(x.event);
  assert.equal(await x.event.response,x.response);
  x.releaseWrite();await Promise.all(x.event.waits);
  assert.equal(x.cacheWrites.length,0);
});
test("unrelated page never poisons offline homepage",async()=>{
  const x=boot({path:"/portfolio"});x.listeners.fetch(x.event);
  assert.equal(await x.event.response,x.response);
  x.releaseWrite();await Promise.all(x.event.waits);
  assert.equal(x.putCalls.length,0);
});
test("non-HTML response never poisons offline homepage",async()=>{
  const x=boot({type:"application/json"});x.listeners.fetch(x.event);
  assert.equal(await x.event.response,x.response);
  x.releaseWrite();await Promise.all(x.event.waits);
  assert.equal(x.putCalls.length,0);
});
test("redirected response never poisons offline homepage",async()=>{
  const x=boot({redirected:true});x.listeners.fetch(x.event);
  assert.equal(await x.event.response,x.response);
  x.releaseWrite();await Promise.all(x.event.waits);
  assert.equal(x.putCalls.length,0);
});
