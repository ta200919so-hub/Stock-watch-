import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const storageCode=source.slice(0,source.indexOf("function pnlPct("));
const KEY="stock-watch-ai-v1";
const BACKUP="stock-watch-ai-backup-v1";
const holding=(symbol)=>({symbol,market:"US",name:symbol,shares:1,purchasePriceJPY:100,currentPriceJPY:110});
function setup(initial){
 const store=new Map();
 if(initial!==undefined)store.set(KEY,JSON.stringify(initial));
 const alerts=[];
 const localStorage={
  getItem:k=>store.has(k)?store.get(k):null,
  setItem:(k,v)=>store.set(k,String(v)),
  removeItem:k=>store.delete(k)
 };
 const context=vm.createContext({localStorage,alert:msg=>alerts.push(msg),console});
 const api=vm.runInContext(storageCode+"\n({save,getStocks:()=>stocks,setStocks:next=>{stocks=next}})",context);
 return {store,alerts,api};
}

test("a stale tab cannot overwrite another tab's portfolio or backup",()=>{
 const {store,alerts,api}=setup([holding("AAPL")]);
 const oldBackup=JSON.stringify([holding("AMAT")]);
 store.set(BACKUP,oldBackup);
 // Another tab saves a newer portfolio before this tab attempts to save.
 const newer=JSON.stringify([holding("MSFT"),holding("NVDA")]);
 store.set(KEY,newer);
 api.setStocks([holding("AAPL"),holding("TSLA")]);
 assert.equal(api.save(),false);
 assert.equal(store.get(KEY),newer);
 assert.equal(store.get(BACKUP),oldBackup);
 assert.match(alerts[0],/別のタブ/);
});

test("normal successive saves update the snapshot and preserve recovery backup",()=>{
 const {store,alerts,api}=setup([holding("AAPL")]);
 api.setStocks([holding("AAPL"),holding("AMAT")]);
 assert.equal(api.save(),true);
 assert.equal(JSON.parse(store.get(KEY)).length,2);
 assert.equal(JSON.parse(store.get(BACKUP)).length,1);
 api.setStocks([holding("AAPL"),holding("AMAT"),holding("NVDA")]);
 assert.equal(api.save(),true);
 assert.equal(JSON.parse(store.get(KEY)).length,3);
 assert.equal(JSON.parse(store.get(BACKUP)).length,2);
 assert.equal(alerts.length,0);
});

test("an initially empty tab cannot overwrite holdings added in another tab",()=>{
 const {store,api}=setup();
 store.set(KEY,JSON.stringify([holding("TOTO")]));
 api.setStocks([holding("MSFT")]);
 assert.equal(api.save(),false);
 assert.equal(JSON.parse(store.get(KEY))[0].symbol,"TOTO");
 assert.equal(store.has(BACKUP),false);
});

test("a restored backup can be saved when primary has not changed",()=>{
 const {store,api}=setup([holding("AAPL")]);
 store.set(BACKUP,JSON.stringify([holding("AMAT")]));
 // The tab's loaded snapshot is still the primary; an ordinary save succeeds.
 api.setStocks([holding("AAPL"),holding("MSFT")]);
 assert.equal(api.save(),true);
 assert.equal(JSON.parse(store.get(KEY)).length,2);
});

test("automatic quote refresh preserves an existing healthy recovery snapshot",()=>{
 const {store,alerts,api}=setup([holding("AAPL")]);
 const recovery=JSON.stringify([holding("AMAT"),holding("NVDA")]);
 store.set(BACKUP,recovery);
 api.setStocks([{...holding("AAPL"),currentPriceJPY:250}]);
 assert.equal(api.save({preserveBackup:true}),true);
 assert.equal(JSON.parse(store.get(KEY))[0].currentPriceJPY,250);
 assert.equal(store.get(BACKUP),recovery,"background refresh must not replace a recoverable holdings snapshot");
 assert.equal(alerts.length,0);
});

test("automatic quote refresh seeds a missing backup without losing holdings",()=>{
 const {store,api}=setup([holding("AAPL")]);
 api.setStocks([{...holding("AAPL"),currentPriceJPY:250}]);
 assert.equal(api.save({preserveBackup:true}),true);
 assert.equal(JSON.parse(store.get(KEY))[0].currentPriceJPY,250);
 assert.equal(JSON.parse(store.get(BACKUP))[0].currentPriceJPY,110);
});

test("automatic quote refresh repairs corrupt backup but never overwrites stale primary",()=>{
 const {store,api}=setup([holding("AAPL")]);
 store.set(BACKUP,"{corrupt");
 api.setStocks([{...holding("AAPL"),currentPriceJPY:250}]);
 assert.equal(api.save({preserveBackup:true}),true);
 assert.equal(JSON.parse(store.get(BACKUP))[0].symbol,"AAPL");
 const previous=store.get(BACKUP);
 store.set(KEY,JSON.stringify([holding("MSFT")]));
 api.setStocks([holding("TSLA")]);
 assert.equal(api.save({preserveBackup:true}),false);
 assert.equal(JSON.parse(store.get(KEY))[0].symbol,"MSFT");
 assert.equal(store.get(BACKUP),previous);
});

test("normal holding edits still rotate the recovery snapshot after price-only refresh",()=>{
 const {store,api}=setup([holding("AAPL")]);
 store.set(BACKUP,JSON.stringify([holding("AMAT")]));
 api.setStocks([{...holding("AAPL"),currentPriceJPY:200}]);
 assert.equal(api.save({preserveBackup:true}),true);
 api.setStocks([holding("AAPL"),holding("MSFT")]);
 assert.equal(api.save(),true);
 assert.equal(JSON.parse(store.get(BACKUP))[0].currentPriceJPY,200);
});

test("refreshAll uses price-only persistence instead of rotating the backup",()=>{
 assert.match(source,/const saved=save\(\{preserveBackup:true\}\)/);
});
