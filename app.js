const KEY="stock-watch-ai-v1";
const samples=[
 {market:"JP",name:"東京エレクトロン",ticker:"8035",start:25000,current:31000,memo:"先端半導体投資",view:"上昇寄り",ai:"半導体設備投資が追い風。需要サイクルの減速には注意。"},
 {market:"US",name:"NVIDIA",ticker:"NVDA",start:22500,current:27750,memo:"AI需要",view:"上昇寄り",ai:"AI計算需要が追い風。一方、高い成長期待が織り込まれている点には注意。"},
 {market:"US",name:"Applied Materials",ticker:"AMAT",start:28500,current:32250,memo:"半導体製造装置",view:"中立〜上昇",ai:"先端ロジック・メモリ投資が追い風。設備投資周期や規制動向がリスク。"}
];
let stocks=JSON.parse(localStorage.getItem(KEY)||"null")||samples;
let filter="ALL";
const $=s=>document.querySelector(s);
const yen=n=>"¥"+new Intl.NumberFormat("ja-JP",{maximumFractionDigits:0}).format(n);
const pct=s=>(s.current/s.start-1)*100;
function save(){localStorage.setItem(KEY,JSON.stringify(stocks))}
function autoComment(s){
 const p=pct(s);
 if(p>15)return {view:"上昇基調",ai:`登録時から${p.toFixed(1)}%上昇。勢いは強い一方、過熱や材料出尽くしに注意。決算とニュース確認を優先。`};
 if(p<-10)return {view:"慎重",ai:`登録時から${Math.abs(p).toFixed(1)}%下落。反転材料が出るまでは慎重。業績悪化か一時的調整かの確認が重要。`};
 return {view:"中立",ai:"値動きだけでは方向感は限定的。次の決算、業績予想、関連ニュースを確認したい局面。"};
}
function render(){
 const shown=stocks.filter(s=>filter==="ALL"||s.market===filter);
 $("#list").innerHTML=shown.length?shown.map(s=>{
   const i=stocks.indexOf(s),p=pct(s),cls=p>=0?"up":"down";
   return `<article class="card"><div class="top"><div><div class="name">${escapeHtml(s.name)}</div><div class="ticker">${s.market==="JP"?"🇯🇵":"🇺🇸"} ${escapeHtml(s.ticker)}</div></div><div class="price">${yen(s.current)}<div class="change ${cls}">${p>=0?"+":""}${p.toFixed(1)}%</div></div></div><div class="ai"><div class="ai-head">🤖 AI見通し <span class="badge">${escapeHtml(s.view)}</span></div>${escapeHtml(s.ai)}</div><div class="bottom"><div class="small">登録時 ${yen(s.start)}${s.memo?" ・ "+escapeHtml(s.memo):""}</div><button class="delete" data-del="${i}">削除</button></div></article>`;
 }).join(""):`<div class="empty">銘柄を追加してウォッチを始めよう。</div>`;
 $("#count").textContent=stocks.length;
 $("#average").textContent=stocks.length?`${stocks.reduce((a,s)=>a+pct(s),0)/stocks.length>=0?"+":""}${(stocks.reduce((a,s)=>a+pct(s),0)/stocks.length).toFixed(1)}%`:"—";
 $("#best").textContent=stocks.length?[...stocks].sort((a,b)=>pct(b)-pct(a))[0].name:"—";
}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
document.querySelectorAll(".filter").forEach(b=>b.addEventListener("click",()=>{filter=b.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));b.classList.add("active");render()}));
$("#openAdd").addEventListener("click",()=>$("#addDialog").showModal());
$("#closeAdd").addEventListener("click",()=>$("#addDialog").close());
$("#addForm").addEventListener("submit",e=>{e.preventDefault();const s={market:$("#market").value,name:$("#name").value.trim(),ticker:$("#ticker").value.trim().toUpperCase(),start:Number($("#startPrice").value),current:Number($("#currentPrice").value),memo:$("#memo").value.trim()};Object.assign(s,autoComment(s));stocks.unshift(s);save();render();e.target.reset();$("#addDialog").close()});
$("#list").addEventListener("click",e=>{const b=e.target.closest("[data-del]");if(!b)return;stocks.splice(Number(b.dataset.del),1);save();render()});
$("#refreshBtn").addEventListener("click",()=>{stocks=stocks.map(s=>Object.assign(s,autoComment(s)));save();render()});
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js");
render();