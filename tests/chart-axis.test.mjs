import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../chart-helper.js',import.meta.url),'utf8');
const build=vm.runInNewContext(src+'\nbuildHistoryChart',{});
const p=(date,priceJPY)=>({date,priceJPY});
test('renders dated horizontal ticks and vertical yen labels',()=>{
 const out=build([p('2026-10-01',1000),p('2026-10-11',1100),p('2026-10-21',1200)]);
 assert.match(out,/26\/10\/01/);assert.match(out,/26\/10\/11/);assert.match(out,/26\/10\/21/);
 assert.match(out,/<text x="59"/);assert.match(out,/¥1,200/);assert.match(out,/aria-label="株価推移（円）"/);
});
test('flat prices yield finite points',()=>{
 const out=build([p('2026-10-01',1000),p('2026-10-02',1000)]);
 assert.ok(out);assert.doesNotMatch(out,/NaN|Infinity/);
});
test('filters malformed and non-finite prices',()=>{
 const out=build([p('2026-10-01',100),p('2026-10-02',NaN),p('2026-10-03',Infinity),p('2026-10-04',-10),p('2026-10-05',110)]);
 assert.ok(out);assert.doesNotMatch(out,/NaN|Infinity/);
});
test('sorts dates before drawing and displays latest price',()=>{
 const out=build([p('2026-10-21',1200),p('2026-10-01',1000)]);
 assert.ok(out.indexOf('26/10/01')<out.indexOf('26/10/21'));
 assert.match(out,/最新 ¥1,200/);
});
test('deduplicates dates, using last reported close',()=>{
 const out=build([p('2026-10-01',1000),p('2026-10-01',2000),p('2026-10-02',3000)]);
 assert.match(out,/最新 ¥3,000/);assert.equal((out.match(/<polyline /g)||[]).length,1);
});
test('rejects unsafe date and script injection',()=>{
 const out=build([p('2026-10-01',1000),p('<img src=x onerror=alert(1)>',2000),p('2026-10-02',1100)]);
 assert.ok(out);assert.doesNotMatch(out,/<img|onerror/);
});
test('requires at least two usable distinct dates',()=>{
 assert.equal(build([p('2026-10-01',100)]),null);
 assert.equal(build([p('2026-10-01',100),p('2026-10-01',200)]),null);
 assert.equal(build([]),null);
});
test('handles five years of trading days',()=>{
 const rows=Array.from({length:1300},(_,i)=>p(new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10),1000+i));
 const out=build(rows);assert.ok(out);assert.doesNotMatch(out,/NaN|Infinity/);
});
