async function getJson(url){const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});if(!r.ok)throw new Error("upstream_"+r.status);return r.json()}
const n=v=>{if(v==null||v==="")return null;const x=Number(v?.raw??v);return Number.isFinite(x)?x:null};
async function chart(symbol,range="1y"){const j=await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`);return j?.chart?.result?.[0]||null}
async function fxJPY(){try{return n((await chart("JPY=X","5d"))?.meta?.regularMarketPrice)||1}catch{return 1}}
export default async function handler(req,res){
 const symbol=String(req.query.symbol||""),market=String(req.query.market||"JP");if(!symbol)return res.status(400).json({error:"symbol_required"});
 let out={trailingPE:null,forwardPE:null,marketCap:null,profitMargin:null,revenueGrowth:null,earningsGrowth:null,recommendationKey:null,targetMeanPrice:null,targetMeanPriceJPY:null};
 try{
   const c=await chart(symbol,"1y"),m=c?.meta||{};
   const price=n(m.regularMarketPrice),eps=n(m.epsTrailingTwelveMonths);
   if(price!=null&&eps!=null&&eps!==0)out.trailingPE=price/eps;
 }catch{}
 try{
   const modules="summaryDetail,defaultKeyStatistics,financialData";
   const j=await getJson(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`);
   const x=j?.quoteSummary?.result?.[0]||{},sd=x.summaryDetail||{},ks=x.defaultKeyStatistics||{},fd=x.financialData||{};
   out.trailingPE=out.trailingPE??n(sd.trailingPE);out.forwardPE=n(ks.forwardPE);out.marketCap=n(sd.marketCap);out.profitMargin=n(fd.profitMargins);out.revenueGrowth=n(fd.revenueGrowth);out.earningsGrowth=n(fd.earningsGrowth);out.recommendationKey=fd.recommendationKey||null;out.targetMeanPrice=n(fd.targetMeanPrice);
 }catch{}
 const fx=market==="US"?await fxJPY():1;out.targetMeanPriceJPY=out.targetMeanPrice==null?null:out.targetMeanPrice*fx;
 out.unavailable=!Object.entries(out).some(([k,v])=>k!=="unavailable"&&v!=null);
 res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=120");return res.status(200).json(out);
}