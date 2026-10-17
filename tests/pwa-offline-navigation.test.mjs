import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
function navigate(path, {offline=true}={}) {
  const handlers={};
  const cached={kind:'app-shell'};
  const network={kind:'network',ok:true,redirected:false,headers:{get:()=> 'text/html'},clone(){return this}};
  const cache={match:async()=>cached,put:async()=>{}};
  const caches={open:async()=>cache};
  const fetch=async()=>{if(offline)throw new Error('offline');return network};
  const self={location:{href:'https://example.com/sw.js'},addEventListener:(type,fn)=>handlers[type]=fn};
  vm.runInNewContext(source,{self,caches,fetch,URL,Promise});
  const waits=[];
  const event={request:{url:'https://example.com'+path,mode:'navigate',method:'GET'},
    waitUntil(p){waits.push(p)},respondWith(p){this.response=Promise.resolve(p)}};
  handlers.fetch(event);
  return {event,waits,cached,network};
}
test('offline app root loads the cached shell',async()=>{
  const x=navigate('/');assert.equal(await x.event.response,x.cached);await Promise.all(x.waits);
});
test('offline index.html loads the cached shell',async()=>{
  const x=navigate('/index.html');assert.equal(await x.event.response,x.cached);await Promise.all(x.waits);
});
test('unrelated offline URL does not masquerade as the portfolio app',async()=>{
  const x=navigate('/unrelated-page');await assert.rejects(x.event.response,/offline/);await Promise.all(x.waits);
});
test('online unrelated URL passes through network response',async()=>{
  const x=navigate('/unrelated-page',{offline:false});assert.equal(await x.event.response,x.network);await Promise.all(x.waits);
});
