import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../api/history.js',import.meta.url),'utf8');
function chartFor(timestamps,closes){
 const fetch=async()=>({ok:true,json:async()=>({chart:{result:[{timestamp:timestamps,indicators:{quote:[{close:closes}]},meta:{currency:'JPY'}}]}})});
 const context=vm.createContext({fetch,encodeURIComponent,Date,Number,Error,Set,Map});
 return vm.runInContext(source.replace('export default async function handler','async function handler')+'\ngetChart',context);
}
test('chart skips invalid timestamps and deduplicates dates',async()=>{
 const getChart=chartFor([NaN,0,86400,86400],[100,50,60,70]);
 const result=await getChart('7203.T','1mo');
 assert.deepEqual(Array.from(result.points,p=>[p.date,p.price]),[['1970-01-01',50],['1970-01-02',70]]);
});
