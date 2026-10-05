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
const JA_NAMES={
  "NVDA":"エヌビディア","AMAT":"アプライド マテリアルズ","AAPL":"アップル","MSFT":"マイクロソフト","GOOGL":"アルファベット","GOOG":"アルファベット","AMZN":"アマゾン","META":"メタ・プラットフォームズ","TSLA":"テスラ","AVGO":"ブロードコム","QCOM":"クアルコム",
  "8035.T":"東京エレクトロン","7974.T":"任天堂","2802.T":"味の素","8001.T":"伊藤忠商事","7011.T":"三菱重工業","7012.T":"川崎重工業","7701.T":"島津製作所","5332.T":"TOTO","7203.T":"トヨタ自動車","6758.T":"ソニーグループ","6501.T":"日立製作所","6702.T":"富士通","6502.T":"東芝"
};
function displayName(s){return JA_NAMES[s.symbol]||s.name||s.symbol||"銘柄"}
const SECTORS={"NVDA":"半導体","AMAT":"半導体","QCOM":"半導体","AVGO":"半導体","8035.T":"半導体","7974.T":"ゲーム","2802.T":"食品","8001.T":"商社","7011.T":"重工","7012.T":"重工","7701.T":"精密機器","5332.T":"住宅設備","7203.T":"自動車","6758.T":"エンタメ","6501.T":"IT・インフラ","6702.T":"IT","AAPL":"テクノロジー","MSFT":"テクノロジー","GOOGL":"インターネット","AMZN":"消費・クラウド","META":"インターネット","TSLA":"自動車"};
function stockScore(s){
  const p=pnlPct(s),d=Number.isFinite(s.dayChangePct)?s.dayChangePct:0;
  if(p===null)return null;
  let score=50+Math.max(-15,Math.min(15,p/2))+Math.max(-10,Math.min(10,d*2));
  if(p>35)score-=8;if(p<-20)score-=8;
  if(Number.isFinite(s.fundamentals?.profitMargin))score+=s.fundamentals.profitMargin>0.15?6:s.fundamentals.profitMargin<0? -8:2;
  if(Number.isFinite(s.fundamentals?.revenueGrowth))score+=s.fundamentals.revenueGrowth>0.1?6:s.fundamentals.revenueGrowth<0? -6:0;
  if(Number.isFinite(s.fundamentals?.trailingPE)&&s.fundamentals.trailingPE>60)score-=5;
  return Math.max(0,Math.min(100,Math.round(score)));
}
function autoComment(s){
  const p=pnlPct(s), d=Number.isFinite(s.dayChangePct)?s.dayChangePct:null;
  if(p===null)return {view:"データ待ち",short:"現在株価または保有情報を取得すると分析します。",medium:"購入単価との比較データ待ちです。",risk:"価格データ不足。",watch:"株価を更新してください。"};
  let view=p>=15?"強気寄り":p<=-10?"慎重":"中立";
  const short=d===null?"前日比データ待ち":d>=2?`前日比 +${d.toFixed(1)}%。短期モメンタムは強め。`:d<=-2?`前日比 ${d.toFixed(1)}%。短期は売り圧力に注意。`:`前日比 ${d>=0?"+":""}${d.toFixed(1)}%。短期の値動きは比較的落ち着いています。`;
  const medium=p>=15?`購入単価を${p.toFixed(1)}%上回っています。利益が乗っているため、上昇継続だけでなく利益確定による反落にも注意。`:p<=-10?`購入単価を${Math.abs(p).toFixed(1)}%下回っています。買値への回復を前提にせず、下落理由が業績要因か市場要因か確認したい局面。`:`購入単価との差は${p>=0?"+":""}${p.toFixed(1)}%。現時点では方向感を決めつけず、次の材料確認を優先。`;
  const risk=Math.abs(d||0)>=4?"1日の変動が大きく、短期ボラティリティが高まっています。":p>=25?"含み益が大きく、好材料を織り込んでいる可能性に注意。":p<=-15?"含み損が拡大しています。追加購入は下落要因の確認後に判断したい水準。":"購入単価だけで判断せず、決算・業績予想・セクター動向の確認が必要。";
  const watch="次は「直近決算・会社予想・関連ニュース」を確認。v3.2でこの情報を自動連携予定。";
  return {view,short,medium,risk,watch};
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
        <div><div class="name">${escapeHtml(displayName(s))}</div><div class="market">${s.market==="JP"?"🇯🇵 日本株":"🇺🇸 米国株"}</div></div>
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
      <div class="fundamentals"><div><span>PER</span><strong>${Number.isFinite(s.fundamentals?.trailingPE)?s.fundamentals.trailingPE.toFixed(1):"—"}</strong></div><div><span>売上成長</span><strong>${Number.isFinite(s.fundamentals?.revenueGrowth)?(s.fundamentals.revenueGrowth*100).toFixed(1)+"%":"—"}</strong></div><div><span>利益率</span><strong>${Number.isFinite(s.fundamentals?.profitMargin)?(s.fundamentals.profitMargin*100).toFixed(1)+"%":"—"}</strong></div><div><span>目標株価</span><strong>${Number.isFinite(s.fundamentals?.targetMeanPriceJPY)?yen(s.fundamentals.targetMeanPriceJPY):"—"}</strong></div></div>
      <div class="ai"><div class="ai-head">🤖 AI見通し <span class="badge">${escapeHtml(c.view)}</span><span class="score">${stockScore(s)===null?"—":stockScore(s)+"点"}</span></div><div class="ai-grid"><div><b>短期</b><span>${escapeHtml(c.short)}</span></div><div><b>中期</b><span>${escapeHtml(c.medium)}</span></div><div><b>リスク</b><span>${escapeHtml(c.risk)}</span></div><div><b>次に見る</b><span>${escapeHtml(c.watch)}</span></div></div></div>
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
  renderAllocation();
  renderRecommendations();
}
function renderRecommendations(){
  const box=$("#recommendations"); if(!box)return;
  const held=new Set(stocks.map(s=>s.symbol));
  const sectorCounts={};stocks.forEach(s=>{const sec=SECTORS[s.symbol]||"その他";sectorCounts[sec]=(sectorCounts[sec]||0)+1});
  const candidates=[
    {symbol:"2802.T",name:"味の素",sector:"食品",why:"景気敏感・半導体への偏りを和らげる候補"},
    {symbol:"8001.T",name:"伊藤忠商事",sector:"商社",why:"事業分散が広く、単一テーマへの集中を抑えやすい"},
    {symbol:"7203.T",name:"トヨタ自動車",sector:"自動車",why:"製造業の中でも半導体装置とは異なる収益源"},
    {symbol:"6758.T",name:"ソニーグループ",sector:"エンタメ",why:"ゲーム・音楽・映像などIP収益を組み合わせられる"},
    {symbol:"MSFT",name:"マイクロソフト",sector:"テクノロジー",why:"AI需要を取り込みつつクラウド・ソフトの継続収益も持つ"}
  ].filter(x=>!held.has(x.symbol)).map(x=>({...x,fit:sectorCounts[x.sector]?72:86})).sort((a,b)=>b.fit-a.fit).slice(0,3);
  box.innerHTML=candidates.length?candidates.map(x=>`<div class="recommend"><div><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.sector)}</span></div><b>${x.fit}点</b><p>${escapeHtml(x.why)}</p><small>候補スコアはポートフォリオ分散を中心に算出。買い推奨ではありません。</small></div>`).join(""):'<div class="muted">候補を計算するには保有銘柄を登録してください。</div>';
}
function renderAllocation(){
  const held=stocks.filter(s=>s.shares>0&&s.currentPriceJPY>0).map(s=>({...s,value:s.shares*s.currentPriceJPY})).sort((a,b)=>b.value-a.value);
  const total=held.reduce((a,s)=>a+s.value,0);
  $("#donutTotal").textContent=yen(total); $("#holdingCount").textContent=held.length?held.length+"銘柄":"";
  if(!total){$("#donut").style.background="var(--panel2)";$("#legend").innerHTML='<span class="muted">現在株価を取得すると表示されます</span>';$("#concentration").textContent="保有データが揃うと構成比を分析します。";return}
  const colors=["#7c8cff","#4ade80","#fbbf24","#fb7185","#38bdf8","#c084fc","#fb923c","#94a3b8"];
  let at=0,stops=[];held.forEach((s,i)=>{const p=s.value/total*100;stops.push(`${colors[i%colors.length]} ${at}% ${at+p}%`);at+=p});
  $("#donut").style.background=`conic-gradient(${stops.join(",")})`;
  $("#legend").innerHTML=held.map((s,i)=>`<div class="legend-row"><i style="background:${colors[i%colors.length]}"></i><span>${escapeHtml(displayName(s))}</span><strong>${(s.value/total*100).toFixed(1)}%</strong></div>`).join("");
  const top=held[0],pct=top.value/total*100,name=displayName(top);
  $("#concentration").textContent=pct>=40?`⚠️ ${name}が${pct.toFixed(0)}%を占めています。1銘柄への集中度は高めです。`:`✓ 最大比率は${name}の${pct.toFixed(0)}%。銘柄別の偏りをここで確認できます。`;
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
  s.dayChangePct=Number.isFinite(q.dayChangePct)?q.dayChangePct:null;
  try{const fr=await fetch(`/api/fundamentals?symbol=${encodeURIComponent(s.symbol)}&market=${s.market}`);if(fr.ok)s.fundamentals=await fr.json()}catch(e){}
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
  if(edit){const i=Number(edit.dataset.edit),s=stocks[i];$("#editIndex").value=i;$("#editStockName").textContent=displayName(s);$("#editPurchasePrice").value=s.purchasePriceJPY||"";$("#editShares").value=s.shares||"";$("#editPurchaseDate").value=s.purchaseDate||"";$("#editMemo").value=s.memo||"";$("#editDialog").showModal();return}
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
