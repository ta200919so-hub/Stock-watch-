const KEY="stock-watch-ai-v1";
const BACKUP_KEY="stock-watch-ai-backup-v1";
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
function readStocks(){try{const p=JSON.parse(localStorage.getItem(KEY)||"null"),b=JSON.parse(localStorage.getItem(BACKUP_KEY)||"null");const v=Array.isArray(p)&&p.length?p:Array.isArray(b)&&b.length?b:[];return v.map(migrate)}catch{return []}}
let stocks=readStocks();
function save(){if(!stocks.length)return;const data=JSON.stringify(stocks);localStorage.setItem(KEY,data);localStorage.setItem(BACKUP_KEY,data)}
function pnlPct(s){
  if(!s.shares||!s.purchasePriceJPY||!s.currentPriceJPY)return null;
  return (s.currentPriceJPY/s.purchasePriceJPY-1)*100;
}
const JA_NAMES={
  "NVDA":"エヌビディア","AMAT":"アプライド マテリアルズ","AAPL":"アップル","MSFT":"マイクロソフト","GOOGL":"アルファベット","GOOG":"アルファベット","AMZN":"アマゾン","META":"メタ・プラットフォームズ","TSLA":"テスラ","AVGO":"ブロードコム","QCOM":"クアルコム",
  "8035.T":"東京エレクトロン","7974.T":"任天堂","2802.T":"味の素","8001.T":"伊藤忠商事","7011.T":"三菱重工業","7012.T":"川崎重工業","7701.T":"島津製作所","5332.T":"TOTO","7203.T":"トヨタ自動車","6758.T":"ソニーグループ","6501.T":"日立製作所","6702.T":"富士通","6502.T":"東芝"
};
function displayName(s){return JA_NAMES[s.symbol]||s.name||s.symbol||"銘柄"}
const COMPANY_THEMES={
 "7012.T":["防衛・航空宇宙の受注","エネルギー・水素関連","大型案件の採算と受注残"],
 "7011.T":["防衛予算と受注残","GTCC・エネルギー需要","航空宇宙・原子力"],
 "8035.T":["AI/HBM向け半導体投資","先端ロジック・メモリ設備投資","中国向け規制と需要"],
 "5332.T":["半導体向け静電チャック","住宅設備需要","セラミック事業の採算"],
 "7701.T":["分析・計測機器需要","半導体・製薬向け設備投資","海外売上と利益率"],
 "7974.T":["Switchプラットフォーム","マリオ・ポケモン等IP収益","ハード移行期の販売動向"],
 "2802.T":["ABFなど電子材料","食品の価格改定","海外成長と利益率"],
 "8001.T":["非資源事業の利益成長","消費関連・ファミリーマート","株主還元と資本効率"],
 "AMAT":["AI/HBM向け装置需要","先端ロジック・メモリ投資","中国規制とサービス収益"],
 "NVDA":["AIアクセラレータ需要","次世代GPU供給","データセンター投資と競争"],
 "QCOM":["スマホ半導体需要","車載・IoT成長","エッジAIとライセンス収益"],
 "7203.T":["HV・EV販売構成","為替と北米収益","自動運転・ソフトウェア投資"],
 "6758.T":["ゲーム・音楽・映画IP","イメージセンサー需要","PlayStation収益"],
 "6501.T":["デジタル・Lumada","送配電・エネルギー投資","鉄道・社会インフラ"],
 "6702.T":["AI・データセンター","MONAKAプロセッサ","国内DX・モダナイゼーション"]
};
function companyThemes(s){return COMPANY_THEMES[s.symbol]||[`${SECTORS[s.symbol]||"主力事業"}の需要`,"次回決算の売上・利益","会社予想と重要ニュース"]}

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
function decision(s){
  const base=stockScore(s);if(base===null)return {label:"データ待ち",kind:"neutral",score:null,reasons:["株価と保有情報を更新してください。"]};
  let score=base,reasons=[];const f=s.fundamentals||{},news=s.news||[];
  const total=stocks.reduce((a,x)=>a+(x.shares||0)*(x.currentPriceJPY||0),0),value=(s.shares||0)*(s.currentPriceJPY||0),weight=total?value/total:0;
  const pos=news.filter(n=>n.impact==="positive").length,neg=news.filter(n=>n.impact==="negative").length;
  if(pos>neg){score+=5;reasons.push("直近ニュースは好材料が優勢");}else if(neg>pos){score-=7;reasons.push("直近ニュースは悪材料が優勢");}
  if(Number.isFinite(f.revenueGrowth)){if(f.revenueGrowth>0.1)reasons.push("売上成長率が10%超");else if(f.revenueGrowth<0)reasons.push("売上成長率がマイナス");}
  if(Number.isFinite(f.profitMargin)&&f.profitMargin>0.15)reasons.push("利益率が比較的高い");
  if(Number.isFinite(f.trailingPE)&&f.trailingPE>60){score-=4;reasons.push("PERが高水準");}
  if(weight>0.35){score-=10;reasons.push("ポートフォリオ比率が35%超");}
  score=Math.max(0,Math.min(100,Math.round(score)));
  const label=score>=68?"買い増し検討":score<45?"注意":"様子見",kind=score>=68?"positive":score<45?"negative":"neutral";
  if(!reasons.length)reasons.push("価格・企業指標を総合すると中立圏");
  return {label,kind,score,reasons:reasons.slice(0,3)};
}
function autoComment(s){
 const d=Number.isFinite(s.dayChangePct)?s.dayChangePct:null,f=s.fundamentals||{},news=s.news||[],name=displayName(s),sector=SECTORS[s.symbol]||"事業";
 const pos=news.filter(n=>n.impact==="positive"),neg=news.filter(n=>n.impact==="negative");let score=50,evidence=[],drivers=[];
 if(Number.isFinite(f.revenueGrowth)){score+=f.revenueGrowth>0.1?12:f.revenueGrowth<0?-12:3;evidence.push(`売上 ${f.revenueGrowth>=0?"+":""}${(f.revenueGrowth*100).toFixed(1)}%`);drivers.push(f.revenueGrowth>0?`売上が前年比${(f.revenueGrowth*100).toFixed(1)}%伸びている`:`売上が前年比${Math.abs(f.revenueGrowth*100).toFixed(1)}%減っている`)}
 if(Number.isFinite(f.earningsGrowth)){score+=f.earningsGrowth>0.1?12:f.earningsGrowth<0?-12:2;evidence.push(`利益 ${f.earningsGrowth>=0?"+":""}${(f.earningsGrowth*100).toFixed(1)}%`);drivers.push(f.earningsGrowth>0?"利益成長が売上の伸びを支えている":"利益成長が弱く採算の確認が必要")}
 if(Number.isFinite(f.profitMargin)){score+=f.profitMargin>0.15?7:f.profitMargin<0?-10:1;evidence.push(`利益率 ${(f.profitMargin*100).toFixed(1)}%`)}
 const pe=Number.isFinite(f.forwardPE)?f.forwardPE:f.trailingPE;if(Number.isFinite(pe)){score+=pe<15?6:pe>45?-8:0;evidence.push(`${Number.isFinite(f.forwardPE)?"予想":""}PER ${pe.toFixed(1)}倍`);drivers.push(pe>45?"成長期待を織り込んだ高い評価が下落リスク":"バリュエーションは極端な割高圏ではない")}
 if(d!==null){score+=Math.max(-7,Math.min(7,d*1.4));evidence.push(`前日比 ${d>=0?"+":""}${d.toFixed(1)}%`)}
 if(pos.length>neg.length){score+=8;drivers.push(`直近ニュースでは「${pos[0].title}」がプラス材料`)}else if(neg.length>pos.length){score-=10;drivers.push(`直近ニュースでは「${neg[0].title}」がリスク材料`)}
 score=Math.max(0,Math.min(100,Math.round(score)));const view=score>=67?"強気寄り":score<40?"慎重":"中立";
 if(Number.isFinite(f.quarterRevenueGrowth)){score+=f.quarterRevenueGrowth>0.1?7:f.quarterRevenueGrowth<0?-7:1;evidence.push(`四半期売上 ${f.quarterRevenueGrowth>=0?"+":""}${(f.quarterRevenueGrowth*100).toFixed(1)}%`)} if(Number.isFinite(f.quarterOperatingIncomeGrowth)){score+=f.quarterOperatingIncomeGrowth>0.1?8:f.quarterOperatingIncomeGrowth<0?-8:1;evidence.push(`営業利益 ${f.quarterOperatingIncomeGrowth>=0?"+":""}${(f.quarterOperatingIncomeGrowth*100).toFixed(1)}%`)} const confidence=[f.revenueGrowth,f.earningsGrowth,f.profitMargin,pe,d,f.quarterRevenueGrowth,f.quarterOperatingIncomeGrowth].filter(Number.isFinite).length+(news.length?1:0),quality=confidence>=6?"高":confidence>=3?"中":"低";
 const short=d===null?`${name}は短期価格データが不足。ニュース材料を優先して確認。`:`${name}の短期は前日比${d>=0?"+":""}${d.toFixed(1)}%。${Math.abs(d)>=3?"値動きが大きいため材料の継続性を確認したい。":"価格だけでは方向を決めにくく、次の材料待ち。"}`;
 const themes=companyThemes(s); const base=`${name}は「${themes[0]}」「${themes[1]}」を中心に確認。${drivers.slice(0,2).join("一方、")||sector+"の業績推移が中心材料"}。現在は${view}。`;
 const bull=`${themes[0]}が想定以上に伸び、${pos.length?pos[0].title+"のような好材料が業績に反映され":"売上・利益が市場予想を上回れば"}上振れ余地。`;
 const bear=`${themes[2]}に悪化が見られ、${neg.length?neg[0].title+"の影響が長引くか、":"売上または利益成長が鈍化し、"}${Number.isFinite(pe)&&pe>30?"高いPERの修正が起きる":"採算が悪化する"}場合は下振れ。`;
 const change=`次の決算で売上・利益の方向が現在の想定と逆転する、または重要ニュースの材料方向が変われば見通しを再評価。`;
 return {view,score,short,base,bull,bear,change,evidence:evidence.slice(0,5),quality};
}
function focusScore(s){
  let score=0,reasons=[];const d=Number.isFinite(s.dayChangePct)?s.dayChangePct:0,dec=decision(s),news=s.news||[];
  const total=stocks.reduce((a,x)=>a+(x.shares||0)*(x.currentPriceJPY||0),0),value=(s.shares||0)*(s.currentPriceJPY||0),weight=total?value/total:0;
  if(Math.abs(d)>=3){score+=25+Math.min(15,Math.abs(d)*2);reasons.push(`前日比 ${d>=0?"+":""}${d.toFixed(1)}% と値動き大`);}
  const neg=news.filter(n=>n.impact==="negative").length,pos=news.filter(n=>n.impact==="positive").length;
  if(neg){score+=20+neg*5;reasons.push("悪材料ニュースを確認");}else if(pos){score+=10+pos*3;reasons.push("好材料ニュースあり");}
  if(dec.kind==="negative"){score+=20;reasons.push("総合判定が注意");}
  if(weight>=0.25){score+=Math.round(weight*30);reasons.push(`保有比率 ${(weight*100).toFixed(0)}%`);}
  const p=pnlPct(s);if(p!==null&&Math.abs(p)>=20){score+=10;reasons.push(`買値比 ${p>=0?"+":""}${p.toFixed(0)}%`);}
  if(!reasons.length)reasons.push("大きな警戒材料は少なめ");
  return {score,reasons:reasons.slice(0,2),decision:dec};
}
function renderTodayFocus(){
  const box=$("#todayFocus");if(!box)return;
  const items=stocks.filter(s=>s.shares>0&&s.currentPriceJPY>0).map(s=>({s,...focusScore(s)})).sort((a,b)=>b.score-a.score).slice(0,3);
  box.innerHTML=items.length?items.map((x,i)=>`<div class="focus-card"><b>#${i+1}</b><div><strong>${escapeHtml(displayName(x.s))}</strong><p>${x.reasons.map(escapeHtml).join(" ・ ")}</p></div><span class="${x.decision.kind}">${escapeHtml(x.decision.label)}</span></div>`).join(""):'<div class="muted">保有銘柄を登録・更新すると表示されます。</div>';
}
function portfolio(){
  const held=stocks.filter(s=>s.shares>0&&s.purchasePriceJPY>0);
  const cost=held.reduce((a,s)=>a+s.purchasePriceJPY*s.shares,0);
  const value=held.reduce((a,s)=>a+(s.currentPriceJPY||0)*s.shares,0);
  return {cost,value,pnl:value-cost,pct:cost?((value/cost)-1)*100:null};
}
function renderDetail(i){
  const s=stocks[i];if(!s)return;const c=autoComment(s),dec=decision(s),f=s.fundamentals||{};
  $("#detailTitle").textContent=displayName(s);$("#detailPrice").textContent=s.currentPriceJPY?yen(s.currentPriceJPY):"—";
  $("#detailBody").innerHTML=`
    <div class="decision ${dec.kind}"><div><span>総合判定</span><strong>${escapeHtml(dec.label)}</strong></div><p>${dec.reasons.map(escapeHtml).join(" ・ ")}</p></div>
    <section class="detail-section"><h3>決算分析</h3><div class="fundamentals detail-metrics"><div><span>次回決算</span><strong>${Number.isFinite(f.nextEarningsDate)?new Date(f.nextEarningsDate*1000).toLocaleDateString("ja-JP"):"—"}</strong></div><div><span>四半期売上</span><strong>${Number.isFinite(f.quarterRevenue)?new Intl.NumberFormat("ja-JP",{notation:"compact",maximumFractionDigits:1}).format(f.quarterRevenue):"—"}</strong></div><div><span>売上 前年比</span><strong>${Number.isFinite(f.quarterRevenueGrowth)?(f.quarterRevenueGrowth>=0?"+":"")+(f.quarterRevenueGrowth*100).toFixed(1)+"%":"—"}</strong></div><div><span>営業利益</span><strong>${Number.isFinite(f.quarterOperatingIncome)?new Intl.NumberFormat("ja-JP",{notation:"compact",maximumFractionDigits:1}).format(f.quarterOperatingIncome):"—"}</strong></div><div><span>営業利益 前年比</span><strong>${Number.isFinite(f.quarterOperatingIncomeGrowth)?(f.quarterOperatingIncomeGrowth>=0?"+":"")+(f.quarterOperatingIncomeGrowth*100).toFixed(1)+"%":"—"}</strong></div><div><span>EPSサプライズ</span><strong>${Number.isFinite(f.earningsSurprisePct)?(f.earningsSurprisePct>=0?"+":"")+(f.earningsSurprisePct*100).toFixed(1)+"%":"—"}</strong></div></div><p class="muted">最新四半期と前年同期を比較。取得できない項目は — 表示。</p></section><section class="detail-section"><h3>企業指標</h3><div class="fundamentals detail-metrics"><div><span>PER</span><strong>${Number.isFinite(f.trailingPE)?f.trailingPE.toFixed(1)+"倍":"—"}</strong></div><div><span>予想PER</span><strong>${Number.isFinite(f.forwardPE)?f.forwardPE.toFixed(1)+"倍":"—"}</strong></div><div><span>売上成長</span><strong>${Number.isFinite(f.revenueGrowth)?(f.revenueGrowth*100).toFixed(1)+"%":"—"}</strong></div><div><span>利益率</span><strong>${Number.isFinite(f.profitMargin)?(f.profitMargin*100).toFixed(1)+"%":"—"}</strong></div><div><span>利益成長</span><strong>${Number.isFinite(f.earningsGrowth)?(f.earningsGrowth*100).toFixed(1)+"%":"—"}</strong></div><div><span>目標株価</span><strong>${Number.isFinite(f.targetMeanPriceJPY)?yen(f.targetMeanPriceJPY):"—"}</strong></div></div></section>
    <section class="detail-section"><h3>注目テーマ</h3><div class="evidence">${companyThemes(s).map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div></section><section class="detail-section"><h3>AI見通し</h3><div class="ai outlook"><div class="ai-head"><span class="badge">${escapeHtml(c.view)}</span><span class="badge">データ信頼度 ${c.quality}</span></div><div class="evidence">${c.evidence.length?c.evidence.map(x=>`<span>${escapeHtml(x)}</span>`).join(""):'<span>取得データ待ち</span>'}</div><div class="ai-grid"><div><b>短期</b><span>${escapeHtml(c.short)}</span></div><div><b>基本</b><span>${escapeHtml(c.base)}</span></div><div><b>強気</b><span>${escapeHtml(c.bull)}</span></div><div><b>弱気</b><span>${escapeHtml(c.bear)}</span></div><div><b>変更条件</b><span>${escapeHtml(c.change)}</span></div></div></div></section>
    <section class="detail-section"><h3>最新ニュース</h3>${s.news?.length?`<div class="news-box">${s.news.slice(0,5).map(n=>`<a class="news-item" href="${escapeHtml(n.url||"#")}" target="_blank" rel="noopener"><div><span class="impact ${n.impact}">${n.impact==="positive"?"好材料":n.impact==="negative"?"悪材料":"中立"}</span><small>${escapeHtml(n.publisher||"News")}</small></div><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.reason)}</p></a>`).join("")}</div>`:'<p class="muted">ニュースデータ待ち</p>'}</section>`;
  $("#homeView").hidden=true;$("#detailView").hidden=false;window.scrollTo(0,0);
}
function render(){
  const shown=stocks.filter(s=>filter==="ALL"||s.market===filter);
  $("#list").innerHTML=shown.length?shown.map(s=>{
    const i=stocks.indexOf(s),p=pnlPct(s),cls=p===null?"":p>=0?"up":"down",cost=s.shares?s.purchasePriceJPY*s.shares:null,value=s.shares&&s.currentPriceJPY?s.currentPriceJPY*s.shares:null,pl=cost!==null&&value!==null?value-cost:null,dec=decision(s),c=autoComment(s);
    return `<article class="card compact-card" data-detail="${i}"><div class="top"><div><div class="name">${escapeHtml(displayName(s))}</div><div class="market">${s.market==="JP"?"🇯🇵 日本株":"🇺🇸 米国株"}</div></div><div class="price">${s.currentPriceJPY?yen(s.currentPriceJPY):"—"}<div class="price-label">現在株価</div></div></div>
    ${s.shares?`<div class="holding-grid compact-holding"><div><span>購入価格</span><strong>${yen(s.purchasePriceJPY)}</strong></div><div><span>保有株数</span><strong>${num(s.shares)}株</strong></div></div><div class="pnl-row"><span>含み損益</span><strong class="${cls}">${pl===null?"—":`${pl>=0?"+":""}${yen(pl)}　${p>=0?"+":""}${p.toFixed(1)}%`}</strong></div>`:""}
    <div class="compact-decision"><span class="${dec.kind}">${escapeHtml(dec.label)}</span></div>
    <div class="bottom"><div class="small">${s.updatedAt?`更新 ${new Date(s.updatedAt).toLocaleString("ja-JP")}`:""}</div><div class="card-actions"><button class="edit" data-edit="${i}">編集</button><button class="delete" data-del="${i}">削除</button><span class="detail-arrow">分析を見る ›</span></div></div></article>`;
  }).join(""):`<div class="empty">保有銘柄を追加してポートフォリオ管理を始めよう。</div>`;
  const t=portfolio();$("#totalCost").textContent=yen(t.cost);$("#totalValue").textContent=yen(t.value);$("#totalPnl").textContent=(t.pnl>=0?"+":"")+yen(t.pnl);$("#totalPnl").className=t.pnl>=0?"up":"down";$("#totalPnlPct").textContent=t.pct===null?"—":`${t.pct>=0?"+":""}${t.pct.toFixed(1)}%`;$("#totalPnlPct").className=t.pct===null?"":t.pct>=0?"up":"down";renderTodayFocus();renderAllocation();renderRecommendations();
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
async function fetchTimeout(url,ms=8000){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{signal:c.signal})}finally{clearTimeout(t)}}
async function refreshOne(s){
  if(!s.symbol)return s;
  const r=await fetchTimeout(`/api/quote?symbol=${encodeURIComponent(s.symbol)}&market=${s.market}`);
  if(!r.ok)throw new Error("quote");
  const q=await r.json();
  s.currentPriceJPY=q.priceJPY;
  s.dayChangePct=Number.isFinite(q.dayChangePct)?q.dayChangePct:null;
  try{const fr=await fetchTimeout(`/api/fundamentals?symbol=${encodeURIComponent(s.symbol)}&market=${s.market}`);if(fr.ok)s.fundamentals=await fr.json()}catch(e){}
  try{const nr=await fetchTimeout(`/api/news?symbol=${encodeURIComponent(s.symbol)}`);if(nr.ok){const nd=await nr.json();s.news=nd.items||[]}}catch(e){}
  s.updatedAt=Date.now();
  return s;
}
async function refreshAll(){
  if(!stocks.length){status("保有銘柄がありません。","error");return}
  const btn=$("#refreshBtn");if(btn.dataset.loading==="1")return;
  btn.dataset.loading="1";btn.disabled=true;status("株価を更新中…");
  let ok=0;
  try{
    for(const s of stocks){try{await refreshOne(s);ok++}catch(e){}}
    save();render();
    status(ok?`${ok}銘柄の株価を更新しました`:"株価を取得できませんでした。もう一度お試しください。",ok?"ok":"error");
  }finally{
    btn.disabled=false;btn.dataset.loading="0";
    setTimeout(()=>status(""),2500);
  }
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
  const b=e.target.closest("[data-del]");if(b){if(confirm("この銘柄を削除しますか？")){stocks.splice(Number(b.dataset.del),1);save();render()}return}
  const card=e.target.closest("[data-detail]");if(card)renderDetail(Number(card.dataset.detail));
});
$("#backHome").addEventListener("click",()=>{$("#detailView").hidden=true;const sv=$("#searchView");if(sv&&$("#globalSearch")?.value){sv.hidden=false}else{$("#homeView").hidden=false}window.scrollTo(0,0)});
$("#closeEdit").addEventListener("click",()=>$("#editDialog").close());
$("#editForm").addEventListener("submit",e=>{e.preventDefault();const i=Number($("#editIndex").value),s=stocks[i];if(!s)return;s.purchasePriceJPY=Number($("#editPurchasePrice").value);s.shares=Number($("#editShares").value);s.purchaseDate=$("#editPurchaseDate").value;s.memo=$("#editMemo").value.trim();save();render();$("#editDialog").close();status("保有情報を更新しました。","ok");setTimeout(()=>status(""),2000)});

let globalSearchTimer=null;
function showSearch(){const v=$("#searchView");if(!v)return;$("#homeView").hidden=true;$("#detailView").hidden=true;v.hidden=false;window.scrollTo(0,0);setTimeout(()=>$("#globalSearch")?.focus(),50)}
function closeSearch(){const v=$("#searchView");if(v)v.hidden=true;$("#detailView").hidden=true;$("#homeView").hidden=false;window.scrollTo(0,0)}
async function globalSearch(){
 const input=$("#globalSearch"),box=$("#globalSuggestions");if(!input||!box)return;const q=input.value.trim();if(!q){box.innerHTML="";return}
 let all=[];
 for(const market of ["JP","US"]){try{const r=await fetch(`/api/search?q=${encodeURIComponent(q)}&market=${market}`);if(r.ok){const d=await r.json();all.push(...(d.results||[]).map(x=>({...x,market})))}}catch{}}
 const seen=new Set();all=all.filter(x=>x.symbol&&!seen.has(x.symbol)&&(seen.add(x.symbol),true)).slice(0,10);
 box.innerHTML=all.length?all.map(x=>`<button type="button" class="suggestion global-result" data-symbol="${escapeHtml(x.symbol)}" data-name="${escapeHtml(x.name)}" data-market="${x.market}"><strong>${escapeHtml(x.name)}</strong><span>${x.market==="JP"?"🇯🇵 日本株":"🇺🇸 米国株"} · ${escapeHtml(x.symbol)}</span></button>`).join(""):'<div class="no-result">候補が見つかりません</div>';
}
async function renderExternalDetail(temp){
 const c=autoComment(temp),f=temp.fundamentals||{};$("#detailTitle").textContent=displayName(temp);$("#detailPrice").textContent=temp.currentPriceJPY?yen(temp.currentPriceJPY):"—";
 $("#detailBody").innerHTML=`<section class="detail-section"><h3>企業指標</h3><div class="fundamentals detail-metrics"><div><span>PER</span><strong>${Number.isFinite(f.trailingPE)?f.trailingPE.toFixed(1)+"倍":"—"}</strong></div><div><span>予想PER</span><strong>${Number.isFinite(f.forwardPE)?f.forwardPE.toFixed(1)+"倍":"—"}</strong></div><div><span>売上成長</span><strong>${Number.isFinite(f.revenueGrowth)?(f.revenueGrowth*100).toFixed(1)+"%":"—"}</strong></div><div><span>利益率</span><strong>${Number.isFinite(f.profitMargin)?(f.profitMargin*100).toFixed(1)+"%":"—"}</strong></div></div></section><section class="detail-section"><h3>AI見通し</h3><div class="ai outlook"><div class="ai-head"><span class="badge">${escapeHtml(c.view)}</span><span class="badge">データ信頼度 ${c.quality}</span></div><div class="evidence">${c.evidence.map(x=>`<span>${escapeHtml(x)}</span>`).join("")}</div><div class="ai-grid"><div><b>短期</b><span>${escapeHtml(c.short)}</span></div><div><b>基本</b><span>${escapeHtml(c.base)}</span></div><div><b>強気</b><span>${escapeHtml(c.bull)}</span></div><div><b>弱気</b><span>${escapeHtml(c.bear)}</span></div></div></div></section>`;
 $("#searchView").hidden=true;$("#homeView").hidden=true;$("#detailView").hidden=false;window.scrollTo(0,0);
}
$("#openSearch")?.addEventListener("click",showSearch);
$("#searchBack")?.addEventListener("click",closeSearch);
$("#globalSearch")?.addEventListener("input",()=>{clearTimeout(globalSearchTimer);globalSearchTimer=setTimeout(globalSearch,300)});
$("#globalSuggestions")?.addEventListener("click",async e=>{const b=e.target.closest(".global-result");if(!b)return;const temp={market:b.dataset.market,name:b.dataset.name,symbol:b.dataset.symbol,purchasePriceJPY:0,shares:null,currentPriceJPY:0,updatedAt:null};try{await refreshOne(temp);await renderExternalDetail(temp)}catch{alert("分析データを取得できませんでした。")}});

$("#refreshBtn").addEventListener("click",refreshAll);

if("serviceWorker"in navigator){
  navigator.serviceWorker.register("./sw.js").then(reg=>reg.update()).catch(()=>{});
}
if(stocks.length)save();render();
setTimeout(()=>{if(stocks.some(s=>s.symbol))refreshAll()},500);
