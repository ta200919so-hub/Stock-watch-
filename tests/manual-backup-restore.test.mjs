import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const storageCode=source.slice(0,source.indexOf("function pnlPct("));
const KEY="stock-watch-ai-v1",BACKUP="stock-watch-ai-backup-v1";
const holding=symbol=>({symbol,name:symbol,market:"US",shares:2,purchasePriceJPY:100,currentPriceJPY:110});
function setup({primary=[holding("AAPL")],backup=[holding("AMAT")],confirmRestore=true,failPrimaryWrite=false}={}){
 const store=new Map(),alerts=[];let confirmations=0;
 if(primary!==null)store.set(KEY,typeof primary==="string"?primary:JSON.stringify(primary));
 if(backup!==null)store.set(BACKUP,typeof backup==="string"?backup:JSON.stringify(backup));
 const localStorage={
  getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>{if(failPrimaryWrite&&key===KEY)throw Error("storage full");store.set(key,String(value))},
  removeItem:key=>store.delete(key)
 };
 const api=vm.runInNewContext(storageCode+"\n({restorePortfolioBackup,getStocks:()=>stocks,getRevision:()=>portfolioRevision})",{
  localStorage,alert:msg=>alerts.push(msg),confirm:()=>{confirmations++;return confirmRestore},console
 });
 return {store,alerts,api,getConfirmations:()=>confirmations};
}

test("manual restore replaces holdings only after confirmation and retains backup",()=>{
 const {store,api,getConfirmations}=setup();
 const previousBackup=store.get(BACKUP);
 assert.equal(api.restorePortfolioBackup().ok,true);
 assert.equal(api.getStocks()[0].symbol,"AMAT");
 assert.equal(JSON.parse(store.get(KEY))[0].symbol,"AMAT");
 assert.equal(store.get(BACKUP),previousBackup);
 assert.equal(api.getRevision(),1);
 assert.equal(getConfirmations(),1);
});

test("cancelled restore does not touch primary, backup, or in-memory holdings",()=>{
 const {store,api}=setup({confirmRestore:false});
 const primary=store.get(KEY),backup=store.get(BACKUP);
 assert.equal(api.restorePortfolioBackup().reason,"cancelled");
 assert.equal(store.get(KEY),primary);
 assert.equal(store.get(BACKUP),backup);
 assert.equal(api.getStocks()[0].symbol,"AAPL");
});

test("missing, corrupt and partial backups are never restored",()=>{
 for(const backup of [null,"{invalid",[holding("AMAT"),{}],[]]){
  const {store,api,getConfirmations}=setup({backup});
  const primary=store.get(KEY);
  const result=api.restorePortfolioBackup();
  assert.equal(result.ok,false);
  assert.equal(store.get(KEY),primary);
  assert.equal(getConfirmations(),0);
 }
});

test("a stale tab cannot restore over another tab's newer primary",()=>{
 const {store,api,alerts}=setup();
 store.set(KEY,JSON.stringify([holding("MSFT")]));
 const backup=store.get(BACKUP);
 assert.equal(api.restorePortfolioBackup().reason,"save_failed");
 assert.equal(JSON.parse(store.get(KEY))[0].symbol,"MSFT");
 assert.equal(store.get(BACKUP),backup);
 assert.equal(api.getStocks()[0].symbol,"AAPL");
 assert.match(alerts[0],/別のタブ/);
});

test("failed primary storage write rolls back in-memory restore",()=>{
 const {store,api,alerts}=setup({failPrimaryWrite:true});
 const primary=store.get(KEY),backup=store.get(BACKUP);
 assert.equal(api.restorePortfolioBackup().reason,"save_failed");
 assert.equal(api.getStocks()[0].symbol,"AAPL");
 assert.equal(store.get(KEY),primary);
 assert.equal(store.get(BACKUP),backup);
 assert.match(alerts[0],/保存できませんでした/);
});

test("recovery button and PWA asset revisions stay linked",()=>{
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 assert.match(html,/id="restoreBackup"/);
 assert.match(source,/restorePortfolioBackup\(\)/);
 assert.match(sw,/const CACHE="stock-watch-ai-v[0-9]+-[0-9]+";/);
 assert.match(html,/app\.js\?v=4\.41/);
 assert.match(sw,/app\.js\?v=4\.41/);
});
