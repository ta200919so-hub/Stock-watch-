async function getJson(url){const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});if(!r.ok)throw new Error("upstream_"+r.status);return r.json()}
const raw=v=>v?.raw??v??null;
const n=v=>{const x=raw(v);if(x==null||x==="")return null;const y=Number(x);return Number.isFinite(y)?y:null};
async function fxJPY(){try{const f=await getJson("https://query1.finance.yahoo.com/v8/finance/chart/JPY=X?interval=1d&range=1d");return n(f?.chart?.result?.[0]?.meta?.regularMarketPrice)||1}catch{return 1}}
async function quoteFallback(symbol){
  try{
    const q=await getJson(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`);
    const x=q?.quoteResponse?.result?.[0]||{};
    return {trailingPE:n(x.trailingPE),forwardPE:n(x.forwardPE),marketCap:n(x.marketCap),targetMeanPrice:n(x.targetMeanPrice),recommendationKey:x.recommendationKey||null};
  }catch{return {}}
}
export default async function handler(req,res){
  const symbol=String(req.query.symbol||"");const market=String(req.query.market||"JP");
  if(!symbol)return res.status(400).json({error:"symbol_required"});
  let out={trailingPE:null,forwardPE:null,marketCap:null,profitMargin:null,revenueGrowth:null,earningsGrowth:null,recommendationKey:null,targetMeanPrice:null,targetMeanPriceJPY:null};
  try{
    const modules="summaryDetail,defaultKeyStatistics,financialData";
    const data=await getJson(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`);
    const x=data?.quoteSummary?.result?.[0]||{},sd=x.summaryDetail||{},ks=x.defaultKeyStatistics||{},fd=x.financialData||{};
    out={...out,trailingPE:n(sd.trailingPE),forwardPE:n(ks.forwardPE),marketCap:n(sd.marketCap),profitMargin:n(fd.profitMargins),revenueGrowth:n(fd.revenueGrowth),earningsGrowth:n(fd.earningsGrowth),recommendationKey:fd.recommendationKey||null,targetMeanPrice:n(fd.targetMeanPrice)};
  }catch(e){}
  const fb=await quoteFallback(symbol);
  for(const k of ["trailingPE","forwardPE","marketCap","targetMeanPrice","recommendationKey"])if(out[k]==null&&fb[k]!=null)out[k]=fb[k];
  const fx=market==="US"?await fxJPY():1;
  out.targetMeanPriceJPY=out.targetMeanPrice==null?null:out.targetMeanPrice*fx;
  out.unavailable=!Object.entries(out).some(([k,v])=>k!=="unavailable"&&v!=null);
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json(out);
}