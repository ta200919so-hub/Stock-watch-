async function getJson(url){const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});if(!r.ok)throw new Error("upstream");return r.json()}
const raw=v=>v?.raw??v??null;
export default async function handler(req,res){
  const symbol=String(req.query.symbol||"");const market=String(req.query.market||"JP");
  if(!symbol)return res.status(400).json({error:"symbol_required"});
  try{
    const modules="summaryDetail,defaultKeyStatistics,financialData";
    const data=await getJson(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`);
    const x=data?.quoteSummary?.result?.[0]||{}, sd=x.summaryDetail||{}, ks=x.defaultKeyStatistics||{}, fd=x.financialData||{};
    let fx=1;if(market==="US"){try{const f=await getJson("https://query1.finance.yahoo.com/v8/finance/chart/JPY=X?interval=1d&range=1d");fx=Number(f?.chart?.result?.[0]?.meta?.regularMarketPrice)||1}catch(e){}}
    const target=Number(raw(fd.targetMeanPrice));
    res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=1800");
    return res.status(200).json({trailingPE:Number(raw(sd.trailingPE))||null,forwardPE:Number(raw(ks.forwardPE))||null,marketCap:Number(raw(sd.marketCap))||null,profitMargin:Number(raw(fd.profitMargins)),revenueGrowth:Number(raw(fd.revenueGrowth)),earningsGrowth:Number(raw(fd.earningsGrowth)),recommendationKey:fd.recommendationKey||null,targetMeanPrice:Number.isFinite(target)?target:null,targetMeanPriceJPY:Number.isFinite(target)?target*fx:null});
  }catch(e){return res.status(200).json({trailingPE:null,forwardPE:null,marketCap:null,profitMargin:null,revenueGrowth:null,earningsGrowth:null,recommendationKey:null,targetMeanPrice:null,targetMeanPriceJPY:null,unavailable:true})}
}