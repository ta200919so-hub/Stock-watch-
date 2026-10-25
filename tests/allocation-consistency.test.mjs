import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const start=source.indexOf("function renderAllocation(){");
const end=source.indexOf("\nfunction status(",start);
assert.ok(start>=0&&end>start,"allocation renderer exists");
const renderSource=source.slice(start,end);

function render(holdings){
  const ids=["#donutTotal","#holdingCount","#donut","#legend","#concentration"];
  const elements=Object.fromEntries(ids.map(id=>[id,{textContent:"",innerHTML:"",style:{background:""}}]));
  const context={
    stocks:holdings,
    $:selector=>elements[selector],
    yen:value=>"¥"+value,
    escapeHtml:value=>String(value),
    displayName:stock=>stock.name||stock.symbol
  };
  vm.runInNewContext(renderSource+"\nrenderAllocation();",context);
  return elements;
}
const holding=(name,cost,price,shares=2)=>({
  name,symbol:name,shares,purchasePriceJPY:cost,currentPriceJPY:price
});

test("allocation excludes holdings without a valid purchase price, matching portfolio totals",()=>{
  const ui=render([
    holding("Valid",100,200),
    holding("MissingCost",0,100000),
    holding("InvalidCost",null,500000)
  ]);
  assert.equal(ui["#donutTotal"].textContent,"¥400");
  assert.equal(ui["#holdingCount"].textContent,"1銘柄");
  assert.match(ui["#legend"].innerHTML,/Valid/);
  assert.doesNotMatch(ui["#legend"].innerHTML,/MissingCost|InvalidCost/);
  assert.match(ui["#concentration"].textContent,/100%/);
});

test("an eligible holding without a quote suppresses allocation rather than inventing a weight",()=>{
  const ui=render([holding("Valid",100,200),holding("Unpriced",100,0)]);
  assert.equal(ui["#donutTotal"].textContent,"—");
  assert.equal(ui["#holdingCount"].textContent,"2銘柄");
  assert.match(ui["#legend"].innerHTML,/株価未取得/);
  assert.equal(ui["#donut"].style.background,"var(--panel2)");
});

test("all valid holdings retain correct valuation and percentages",()=>{
  const ui=render([holding("First",100,100),holding("Second",100,300)]);
  assert.equal(ui["#donutTotal"].textContent,"¥800");
  assert.equal(ui["#holdingCount"].textContent,"2銘柄");
  assert.match(ui["#legend"].innerHTML,/First.*25\\.0%/);
  assert.match(ui["#legend"].innerHTML,/Second.*75\\.0%/);
  assert.match(ui["#donut"].style.background,/conic-gradient/);
});
