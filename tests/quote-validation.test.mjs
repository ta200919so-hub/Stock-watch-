import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../api/quote.js',import.meta.url),'utf8');
function setup({currencyBySymbol={},priceBySymbol={}}={}){
 const requests=[];
 const fetch=async url=>{
  const symbol=decodeURIComponent(new URL(url).pathname.split('/').pop());requests.push(symbol);
  const currency=currencyBySymbol[symbol]??(symbol==='JPY=X'||symbol.endsWith('.T')?'JPY':'USD');
  const price=priceBySymbol[symbol]??(symbol==='JPY=X'?150:symbol.endsWith('.T')?1000:100);
  return {ok:true,json:async()=>({chart:{result:[{meta:{regularMarketPrice:price,previousClose:price/2,currency}}]}})};
 };
 const ctx=vm.createContext({fetch,encodeURIComponent,String,Number,Error});
 const handler=vm.runInContext(source.replace('export default async function handler','async function handler')+'\nhandler',ctx);
 async function run(symbol,market){
  const res={headers:{},status(n){this.code=n;return this},setHeader(k,v){this.headers[k]=v},json(body){this.body=body;return this}};
  await handler({query:{symbol,market}},res);return res;
 }
 return {run,requests};
}
test('JP listed ticker remains in JPY',async()=>{const x=setup(),r=await x.run('7203.T','JP');assert.equal(r.code,200);assert.equal(r.body.priceJPY,1000);assert.deepEqual(x.requests,['7203.T'])});
test('US ticker converts USD to JPY exactly once',async()=>{const x=setup(),r=await x.run('AMAT','US');assert.equal(r.code,200);assert.equal(r.body.priceJPY,15000);assert.deepEqual(x.requests,['AMAT','JPY=X'])});
test('JP market must reject US USD ticker to prevent false yen value',async()=>{const x=setup(),r=await x.run('AMAT','JP');assert.equal(r.code,400);assert.deepEqual(x.requests,[])});
test('US market must reject Tokyo ticker to prevent multiplying JPY by FX',async()=>{const x=setup(),r=await x.run('7203.T','US');assert.equal(r.code,400);assert.deepEqual(x.requests,[])});
test('unknown market must not produce a quote',async()=>{const x=setup(),r=await x.run('AMAT','EU');assert.equal(r.code,400);assert.deepEqual(x.requests,[])});
test('invalid ticker is rejected before Yahoo request',async()=>{const x=setup(),r=await x.run('A/B','US');assert.equal(r.code,400);assert.deepEqual(x.requests,[])});
test('upstream currency mismatch is rejected',async()=>{const x=setup({currencyBySymbol:{'AMAT':'JPY'}}),r=await x.run('AMAT','US');assert.equal(r.code,502);assert.deepEqual(x.requests,['AMAT'])});
test('non-finite upstream price is rejected',async()=>{const x=setup({priceBySymbol:{'AMAT':Infinity}}),r=await x.run('AMAT','US');assert.equal(r.code,502)});
test('wrong FX quote currency is rejected',async()=>{const x=setup({currencyBySymbol:{'JPY=X':'USD'}}),r=await x.run('AMAT','US');assert.equal(r.code,502)});

test('FX multiplication overflow is rejected',async()=>{const x=setup({priceBySymbol:{'AMAT':1e308,'JPY=X':1e308}}),r=await x.run('AMAT','US');assert.equal(r.code,502)});
