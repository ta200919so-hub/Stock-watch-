import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../api/search.js',import.meta.url),'utf8');
function handlerFor(fetch){
 const ctx=vm.createContext({fetch,encodeURIComponent,String,Object});
 return vm.runInContext(source.replace('export default async function handler','async function handler')+'\nhandler',ctx);
}
async function run(query,fetch){
 const res={headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(body){this.body=body;return this}};
 await handlerFor(fetch)({query},res);
 return res;
}
const offline=async()=>{throw Error('offline')};
const empty=async()=>({ok:true,json:async()=>({quotes:[]})});
const cases=[
 ['JP known alias during outage',{q:'ＴＯＴＯ',market:'JP'},offline,200,'5332.T',true],
 ['US known alias during outage',{q:'クアルコム',market:'US'},offline,200,'QCOM',true],
 ['US known symbol during outage',{q:'AMAT',market:'US'},offline,200,'AMAT',true],
 ['US Japanese full company name during outage',{q:'アプライド マテリアルズ',market:'US'},offline,200,'AMAT',true],
 ['JP Japanese full company name during outage',{q:'三菱重工業',market:'JP'},offline,200,'7011.T',true],
 ['full name wrong market during outage',{q:'三菱重工業',market:'US'},offline,502,null,false],
 ['JP code during outage',{q:'7203',market:'JP'},offline,200,'7203.T',true],
 ['US known symbol upstream empty',{q:'AMAT',market:'US'},empty,200,'AMAT',false],
 ['unknown during outage',{q:'unlistedxyz',market:'JP'},offline,502,null,false],
 ['market mismatch during outage',{q:'TOTO',market:'US'},offline,502,null,false],
 ['empty search',{q:'',market:'JP'},offline,200,null,false],
];
for(const [name,q,fetch,status,symbol,degraded] of cases)test(name,async()=>{
 const r=await run(q,fetch);
 assert.equal(r.code,status);
 if(symbol!==null)assert.equal(r.body.results[0].symbol,symbol);
 assert.equal(Boolean(r.body.degraded),degraded);
 if(degraded)assert.equal(r.headers['Cache-Control'],'no-store');
});

test('malformed upstream search payload is not treated as an empty result',async()=>{
 const r=await run({q:'unknown-ticker',market:'JP'},async()=>({ok:true,json:async()=>({quotes:null})}));
 assert.equal(r.code,502);
 assert.equal(r.body.error,'search_failed');
});
test('known ticker uses safe degraded fallback on malformed upstream payload',async()=>{
 const r=await run({q:'AMAT',market:'US'},async()=>({ok:true,json:async()=>({quotes:{bad:true}})}));
 assert.equal(r.code,200);
 assert.equal(r.body.results[0].symbol,'AMAT');
 assert.equal(r.body.degraded,true);
 assert.equal(r.headers['Cache-Control'],'no-store');
});
test('rejects invalid upstream symbols, null entries and non-equities',async()=>{
 const quotes=[
  null,{symbol:'7203.T',quoteType:'EQUITY',longname:'Toyota'},
  {symbol:'7203.T',quoteType:'EQUITY',longname:'Duplicate'},
  {symbol:'285A.T',quoteType:'EQUITY',longname:'New code'},
  {symbol:'7203.T" onclick="evil()',quoteType:'EQUITY'},
  {symbol:'AAPL',quoteType:'EQUITY'},
  {symbol:'1306.T',quoteType:'ETF'},
  {symbol:null,quoteType:'EQUITY'}
 ];
 const r=await run({q:'test',market:'JP'},async()=>({ok:true,json:async()=>({quotes})}));
 assert.equal(r.code,200);
 assert.deepEqual(Array.from(r.body.results,x=>x.symbol),['7203.T','285A.T']);
});
test('non-string upstream company names fall back to the safe ticker',async()=>{
 const r=await run({q:'test',market:'US'},async()=>({ok:true,json:async()=>({quotes:[
  {symbol:'XYZ',quoteType:'EQUITY',longname:{unsafe:true},shortname:12},
  {symbol:'BRK-B',quoteType:'EQUITY',shortname:'Berkshire'}
 ]})}));
 assert.equal(r.code,200);
 assert.deepEqual(Array.from(r.body.results,x=>x.name),['XYZ','Berkshire']);
});
