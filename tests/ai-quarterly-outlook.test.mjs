import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=source.indexOf("function autoComment(s){");
const end=source.indexOf("function focusScore(s){",start);
assert.ok(start>=0&&end>start,"AI outlook function must be available");
const autoComment=vm.runInNewContext(source.slice(start,end)+"\nautoComment",{
  Number,Math,
  displayName:s=>s.name||s.symbol,
  SECTORS:{},
  usableNewsItems:x=>Array.isArray(x)?x:[],
  companyThemes:()=>["売上動向","利益動向","事業リスク"]
});

test("positive quarterly results affect the AI outlook label and narrative",()=>{
  const result=autoComment({symbol:"TEST",name:"テスト企業",fundamentals:{
    profitMargin:0.2,quarterRevenueGrowth:0.2,quarterOperatingIncomeGrowth:0.2
  }});
  assert.equal(result.score,72);
  assert.equal(result.view,"強気寄り");
  assert.match(result.base,/現在は強気寄り/);
});

test("negative quarterly results affect the AI outlook label and narrative",()=>{
  const result=autoComment({symbol:"TEST",name:"テスト企業",fundamentals:{
    quarterRevenueGrowth:-0.2,quarterOperatingIncomeGrowth:-0.2
  }});
  assert.equal(result.score,35);
  assert.equal(result.view,"慎重");
  assert.match(result.base,/現在は慎重/);
});
