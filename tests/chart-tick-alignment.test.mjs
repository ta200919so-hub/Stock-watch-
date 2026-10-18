import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const css=fs.readFileSync(new URL('../style.css',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const decls=selector=>{
 const escaped=selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const rule=css.match(new RegExp(escaped+'\\s*\\{([^}]*)\\}'));
 assert.ok(rule,`${selector} must exist`);
 return Object.fromEntries(rule[1].split(';').map(part=>part.trim()).filter(Boolean).map(part=>{
  const i=part.indexOf(':');return [part.slice(0,i).trim(),part.slice(i+1).trim()];
 }));
};
test('chart yen-axis ticks align with the 10% and 90% SVG guide lines',()=>{
 const axis=decls('.chart-y-axis');
 const svg=decls('.history-chart svg');
 assert.equal(svg.height,'190px');
 assert.equal(axis['line-height'],'14px');
 assert.equal(axis.padding,'12px 0');
 const height=Number.parseFloat(svg.height);
 const padding=Number.parseFloat(axis.padding);
 const lineHeight=Number.parseFloat(axis['line-height']);
 const topTickCenter=padding+lineHeight/2;
 const bottomTickCenter=height-padding-lineHeight/2;
 assert.equal(topTickCenter,height*.1);
 assert.equal(bottomTickCenter,height*.9);
 assert.match(js, /y1="10"/);
 assert.match(js, /y1="90"/);
});
test('mobile chart keeps a 0-minimum-width SVG track',()=>{
 const grid=decls('.chart-grid');
 const svg=decls('.chart-grid svg');
 assert.match(grid['grid-template-columns'],/minmax\\(0,1fr\\)/);
 assert.equal(svg['min-width'],'0');
});
