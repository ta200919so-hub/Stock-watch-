const KEY="stock-watch-ai-v1";
let filter="ALL";
let searchTimer=null;
const $=s=>document.querySelector(s);
const yen=n=>"¥"+new Intl.NumberFormat("ja-JP",{maximumFractionDigits:0}).format(Number(n)||0);
const num=n=>new Intl.NumberFormat("ja-JP",{maximumFractionDigits:4}).format(Number(n)||0);
const escapeHtml=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

function migrate(s){
  if("purchasePriceJPY" in s) return s;
  return {
    market:s.market||"JP", name:s.name||"", symbol:s.ticker||"",
    purchasePriceJPY:Number(s.start)||0, shares:null, purchaseDate:"",
    currentPriceJPY:Number(s.current)||0, memo:s.memo||"",
    view:s.view||"—", ai:s.ai||"", updatedAt:null, legacy:true
  };
}
let stocks=(JSON.parse(localStorage.getItem(KEY)||"null")||[]).map(migrate);
function save(){localStorage.setItem(KEY,JSON.stringify(stocks))}
function pnlPct(s){
  if(!s.shares||!s.purchasePriceJPY||!s.currentPriceJPY)return null;
  return (s.currentPriceJPY/s.purchasePriceJPY-1)*100;
}
function autoComment(s){
  const p=pnlPct(s);
  if(p===null)return {view:"データ待ち",ai:"保有情報または現在株価を取得すると、値動きに応じたコメントを表示します。"};
  if(p>15)return {view:"上昇基調",ai:`購入単価から${p.toFixed(1)}%上昇。勢いは強い一方、決算・業績見通しと過熱感を確認したい局面。`};
  if(p<-10)return {view:"慎重",ai:`購入単価から${Math.abs(p).toFixed(1)}%下落。業績悪化による下落か、一時的な調整かの確認が重要。`};
  return {view:"中立",ai:"購入単価からの値動きは比較的限定的。次の決算、業績予想、関連ニュースを確認したい局面。"};
}
function portfolio(){
  const held=stocks.filter(s=>s.shares>0&&s.purchasePriceJPY>0);
  const cost=held.reduce((a,s)=>a+s.purchasePriceJPY*s.shares,0);
  const value=held.reduce((a,s)=>a+(s.currentPriceJPY||0)*s.shares,0);
  return {cost,value,pnl:value-cost,pct:cost?((value/cost)-1)*100:null};
}
function render(){
  const shown=stocks.filter(s=>filter==="ALL"||s.market===filter);
  $("#list").innerHTML=shown.length?shown.map(s=>{
    const i=stocks.indexOf(s), p=pnlPct(s), cls=p===null?"":p>=0?"up":"down";
    const cost=s.shares? s.purchasePriceJPY*s.shares : null;
    const value=s.shares&&s.currentPriceJPY? s.currentPriceJPY*s.shares : null;
    const pl=cost!==null&&value!==null?value-cost:null;
    const c=autoComment(s);
    return `<article class="card">
      <div class="top">
        <div><div class="name">${escapeHtml(s.name)}</div><div class="market">${s.market==="JP"?"🇯🇵 日本株":"🇺🇸 米国株"}</div></div>
        <div class="price">${s.currentPriceJPY?yen(s.currentPriceJPY):"—"}<div class="price-label">現在株価</div></div>
      </div>
      ${s.shares?`<div class="holding-grid">
        <div><span>購入単価</span><strong>${yen(s.purchasePriceJPY)}</strong></div>
        <div><span>保有株数</span><strong>${num(s.shares)}株</strong></div>
        <div><span>投資額</span><strong>${yen(cost)}</strong></div>
        <div><span>現在評価額</span><strong>${value!==null?yen(value):"—"}</strong></div>
      </div>
      <div class="pnl-row"><span>含み損益</span><strong class="${cls}">${pl===null?"—":`${pl>=0?"+":""}${yen(pl)} ${p>=0?"+":""}${p.toFixed(1)}%`}</strong></div>`:
      `<div class="legacy">以前の登録データです。保有株数が未設定のため総額計算から除外しています。</div>`}
      <div class="ai"><div class="ai-head">🤖 AI見通し <span class="badge">${escapeHtml(c.view)}</span></div>${escapeHtml(c.ai)}</div>
      <div class="bottom"><div class="small">${s.memo?escapeHtml(s.memo):s.updatedAt?`更新 ${new Date(s.updatedAt).toLocaleString("ja-JP")}`:""}</div><div class="card-actions"><button class="edit" data-edit="${i}">編集</button><button class="delete" data-del="${i}">削除</button></div></div>
    </article>`;
  }).join(""):`<div class="empty">保有銘柄を追加してポートフォリオ管理を始めよう。</div>`;

  const t=portfolio();
  $("#totalCost").textContent=yen(t.cost);
  $("#totalValue").textContent=yen(t.value);
  $("#totalPnl").textContent=(t.pnl>=0?"+":"")+yen(t.pnl);
  $("#totalPnl").className=t.pnl>=0?"up":"down";
  $("#totalPnlPct").textContent=t.pct===null?"—":`${t.pct>=0?"+":""}${t.pct.toFixed(1)}%`;
  $("#totalPnlPct").className=t.pct===null?"":t.pct>=0?"up":"down";
}
function status(msg,type=""){
  const el=$("#status"); el.hidden=!msg; el.textContent=msg; el.className=`status ${type}`;
}
async function refreshOne(s){
  if(!s.symbol)return s;
  const r=await fetch(`/api/quote?symbol=${encodeURIComponent(s.symbol)}&market=${s.market}`);
  if(!r.ok)throw new Error("quote");
  const q=await r.json();
  s.currentPriceJPY=q.priceJPY;
  s.updatedAt=Date.now();
  return s;
}
async function refreshAll(){
  if(!stocks.length)return;
  status("株価を更新中…");
  $("#refreshBtn").disabled=true;
  let ok=0;
  for(const s of stocks){
    try{await refreshOne(s);ok++}catch(e){}
  }
  save();render();
  status(ok?`${ok}銘柄の株価を更新しました`:"株価を取得できませんでした。時間をおいて再度お試しください。",ok?"ok":"error");
  $("#refreshBtn").disabled=false;
  setTimeout(()=>status(""),2500);
}
async function searchStocks(){
  const q=$("#name").value.trim(), market=$("#market").value;
  $("#symbol").value=""; $("#selectedStock").hidden=true;
  if(q.length<1){$("#suggestions").hidden=true;return}
  try{
    const r=await fetch(`/api/search?q=${encodeURIComponent(q)}&market=${market}`);
    if(!r.ok)throw new Error();
    const data=await r.json();
    const box=$("#suggestions");
    if(!data.results?.length){box.innerHTML='<div class="no-result">候補が見つかりません</div>';box.hidden=false;return}
    box.innerHTML=data.results.map(x=>`<button type="button" class="suggestion" data-symbol="${escapeHtml(x.symbol)}" data-name="${escapeHtml(x.name)}"><strong>${escapeHtml(x.name)}</strong><span>${market==="JP"?"🇯🇵 日本株":"🇺🇸 米国株"}</span></button>`).join("");
    box.hidden=false;
  }catch(e){$("#suggestions").hidden=true}
}
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");render()}));
$("#openAdd").addEventListener("click",()=>$("#addDialog").showModal());
$("#closeAdd").addEventListener("click",()=>$("#addDialog").close());
$("#name").addEventListener("input",()=>{clearTimeout(searchTimer);searchTimer=setTimeout(searchStocks,350)});
$("#market").addEventListener("change",()=>{$("#symbol").value="";$("#selectedStock").hidden=true;$("#suggestions").hidden=true;if($("#name").value.trim())searchStocks()});
$("#suggestions").addEventListener("click",e=>{
  const b=e.target.closest(".suggestion"); if(!b)return;
  $("#name").value=b.dataset.name; $("#symbol").value=b.dataset.symbol;
  $("#selectedStock").textContent=`✓ ${b.dataset.name} を選択`; $("#selectedStock").hidden=false; $("#suggestions").hidden=true;
});
$("#addForm").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!$("#symbol").value){status("銘柄名を検索し、候補から選択してください。","error");return}
  const s={market:$("#market").value,name:$("#name").value.trim(),symbol:$("#symbol").value,purchasePriceJPY:Number($("#purchasePrice").value),shares:Number($("#shares").value),purchaseDate:"",currentPriceJPY:0,memo:$("#memo").value.trim(),updatedAt:null};
  status("現在株価を取得中…");
  try{await refreshOne(s)}catch(err){status("銘柄は追加しましたが、現在株価を取得できませんでした。","error")}
  stocks.unshift(s);save();render();e.target.reset();$("#symbol").value="";$("#selectedStock").hidden=true;$("#addDialog").close();
  if(s.currentPriceJPY)status("追加しました。現在株価も取得済みです。","ok");
  setTimeout(()=>status(""),2500);
});
$("#list").addEventListener("click",e=>{
  const edit=e.target.closest("[data-edit]");
  if(edit){const i=Number(edit.dataset.edit),s=stocks[i];$("#editIndex").value=i;$("#editStockName").textContent=s.name;$("#editPurchasePrice").value=s.purchasePriceJPY||"";$("#editShares").value=s.shares||"";$("#editPurchaseDate").value=s.purchaseDate||"";$("#editMemo").value=s.memo||"";$("#editDialog").showModal();return}
  const b=e.target.closest("[data-del]");if(!b)return;if(confirm("この銘柄を削除しますか？")){stocks.splice(Number(b.dataset.del),1);save();render()}
});
$("#closeEdit").addEventListener("click",()=>$("#editDialog").close());
$("#editForm").addEventListener("submit",e=>{e.preventDefault();const i=Number($("#editIndex").value),s=stocks[i];if(!s)return;s.purchasePriceJPY=Number($("#editPurchasePrice").value);s.shares=Number($("#editShares").value);s.purchaseDate=$("#editPurchaseDate").value;s.memo=$("#editMemo").value.trim();save();render();$("#editDialog").close();status("保有情報を更新しました。","ok");setTimeout(()=>status(""),2000)});
$("#refreshBtn").addEventListener("click",refreshAll);

if("serviceWorker"in navigator){
  navigator.serviceWorker.register("./sw.js").then(reg=>reg.update()).catch(()=>{});
}
save();render();
setTimeout(()=>{if(stocks.some(s=>s.symbol))refreshAll()},500);
