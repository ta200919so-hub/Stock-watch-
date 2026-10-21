import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('function formatPriceAxis(');
const end=app.indexOf('\nfunction showAnalytics(',start);
assert.ok(start>=0&&end>start,'production axis formatter must exist');
const formatPriceAxis=new Function(app.slice(start,end)+'\nreturn formatPriceAxis;')();
const scales=[.001,.01,.1,1,100,1e3,1e4,1e5,1e6,1e8,1e10,1e12];
const relatives=[1e-8,1e-6,1e-5,1e-4,1e-3,.01,.1];
for(const scale of scales)for(const relative of relatives){
 test('chart ticks '+scale+' relative '+relative,()=>{
  const {labels,caption}=formatPriceAxis(scale,scale*(1+relative));
  assert.equal(labels.length,5);
  assert.equal(new Set(labels).size,5,'tick labels must remain distinct');
  assert.ok(labels.every(x=>[...x].length<=8),'labels must fit reserved gutter');
  assert.ok(caption.includes('円'),'axis units must be explicit');
 });
}
test('invalid chart ranges are rejected',()=>{
 assert.throws(()=>formatPriceAxis(100,100));
 assert.throws(()=>formatPriceAxis(NaN,200));
});
test('production SVG reserves label gutter and renders units',()=>{
 assert.match(app,/const chartLeft=106,chartRight=340/);
 assert.match(app,/viewBox="0 0 358 190"/);
 assert.match(app,/escapeHtml\(axis\.caption\)/);
});
