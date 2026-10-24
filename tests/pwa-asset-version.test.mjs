import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const cache=sw.match(/const CACHE="([^"]+)"/);
test('PWA cache name has a revision',()=>{assert.match(cache?.[1]||'',/^stock-watch-ai-v\d+-\d+$/)});
for(const asset of ['app.js','style.css']){
 test(asset+' version in HTML and service-worker precache matches',()=>{
  const htmlVersion=html.match(new RegExp(asset.replace('.','\\.')+'\\?v=([0-9.]+)'))?.[1];
  const swVersion=sw.match(new RegExp(asset.replace('.','\\.')+'\\?v=([0-9.]+)'))?.[1];
  assert.ok(htmlVersion,'HTML version missing');
  assert.equal(swVersion,htmlVersion);
 });
}
