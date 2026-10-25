async function getJson(url){const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});if(!r.ok)throw new Error("upstream_"+r.status);return r.json()}
const n=v=>{if(v==null||v==="")return null;const x=Number(v?.raw??v);return Number.isFinite(x)?x:null};
async function chart(symbol,range="1y"){const j=await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`);return j?.chart?.result?.[0]||null}
async function timeseries(symbol,types){const now=Math.floor(Date.now()/1000),start=now-86400*900;const j=await getJson(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types.join(",")}&period1=${start}&period2=${now}`);return j?.timeseries?.result||[]}
const latest=(rows,type)=>{const r=rows.find(x=>x.meta?.type?.[0]===type||x[type]);const a=r?.[type];return Array.isArray(a)&&a.length?n(a[a.length-1]?.reportedValue):null};
async function fxJPY(){try{const rate=n((await chart("JPY=X","5d"))?.meta?.regularMarketPrice);return rate!==null&&rate>0?rate:null}catch{return null}}
const currencyOf=(entries)=>{for(const x of entries){const c=x?.currencyCode||x?.currency||x?.reportedValue?.currencyCode;if(typeof c==="string"&&/^[A-Z]{3}$/.test(c))return c}return null};
// ASML reports in EUR even when its NASDAQ-listed shares trade in USD.
// Yahoo's fundamentals timeseries can omit the reporting-currency metadata.
const knownReportingCurrencies={"ASML":"EUR","ASML.AS":"EUR"};
const reportingCurrencyFor=(symbol,market)=>knownReportingCurrencies[symbol.toUpperCase()]||(market==="JP"?"JPY":null);
async function currencyToJPY(currency){
 if(currency==="JPY")return {rate:1,date:null};
 if(!currency||!/^[A-Z]{3}$/.test(currency))return null;
 // Primary quote: Yahoo Finance; independent free ECB-based rate fallback.
 try{
  const c=await chart(currency==="USD"?"JPY=X":currency+"JPY=X","5d");
  const rate=n(c?.meta?.regularMarketPrice),time=n(c?.meta?.regularMarketTime);
  if(rate!==null&&rate>0)return {rate,date:time?new Date(time*1000).toISOString().slice(0,10):null};
 }catch{}
 try{
  const data=await getJson("https://api.frankfurter.dev/v1/latest?base="+encodeURIComponent(currency)+"&symbols=JPY");
  const rate=n(data?.rates?.JPY);
  if(rate!==null&&rate>0)return {rate,date:/^\d{4}-\d{2}-\d{2}$/.test(data?.date||"")?data.date:null};
 }catch{}
 return null;
}
export default async function handler(req,res){
 const symbol=String(req.query.symbol||""),market=String(req.query.market||"JP");if(!symbol)return res.status(400).json({error:"symbol_required"});
 let out={trailingPE:null,forwardPE:null,marketCap:null,profitMargin:null,revenueGrowth:null,earningsGrowth:null,recommendationKey:null,targetMeanPrice:null,targetMeanPriceJPY:null,nextEarningsDate:null,quarterRevenue:null,quarterRevenueGrowth:null,quarterOperatingIncome:null,quarterOperatingIncomeGrowth:null,quarterRevenueJPY:null,quarterOperatingIncomeJPY:null,quarterFinancialCurrency:null,quarterFxRateJPY:null,quarterFxDate:null,earningsSurprisePct:null,source:[]};
 try{const rows=await timeseries(symbol,["trailingPeRatio","forwardPeRatio","trailingMarketCap","annualTotalRevenue","annualNetIncomeContinuousOperations","annualDilutedEPS","quarterlyTotalRevenue","quarterlyOperatingIncome"]);
   out.trailingPE=latest(rows,"trailingPeRatio");out.forwardPE=latest(rows,"forwardPeRatio");out.marketCap=latest(rows,"trailingMarketCap");
   const rev=rows.find(x=>x.annualTotalRevenue)?.annualTotalRevenue||[],ni=rows.find(x=>x.annualNetIncomeContinuousOperations)?.annualNetIncomeContinuousOperations||[];
   if(rev.length){const a=n(rev[rev.length-1]?.reportedValue),b=n(rev[rev.length-2]?.reportedValue);if(a!=null&&b)out.revenueGrowth=a/b-1;const income=n(ni[ni.length-1]?.reportedValue);if(a&&income!=null)out.profitMargin=income/a}
   const eps=rows.find(x=>x.annualDilutedEPS)?.annualDilutedEPS||[];if(eps.length>1){const a=n(eps[eps.length-1]?.reportedValue),b=n(eps[eps.length-2]?.reportedValue);if(a!=null&&b)out.earningsGrowth=a/b-1}
   const qr=rows.find(x=>x.quarterlyTotalRevenue)?.quarterlyTotalRevenue||[],qo=rows.find(x=>x.quarterlyOperatingIncome)?.quarterlyOperatingIncome||[]; const qv=qr.map(x=>n(x.reportedValue)).filter(x=>x!=null),ov=qo.map(x=>n(x.reportedValue)).filter(x=>x!=null); if(qv.length){out.quarterRevenue=qv[qv.length-1];if(qv.length>=5&&qv[qv.length-5])out.quarterRevenueGrowth=qv[qv.length-1]/qv[qv.length-5]-1} if(ov.length){out.quarterOperatingIncome=ov[ov.length-1];if(ov.length>=5&&ov[ov.length-5])out.quarterOperatingIncomeGrowth=ov[ov.length-1]/ov[ov.length-5]-1}
   const qrCurrency=currencyOf(qr),qoCurrency=currencyOf(qo);
   // The stock's trading currency is not necessarily its financial reporting currency.
   // Never silently treat EUR/USD reports as JPY or use a fabricated FX rate.
   if(qrCurrency&&qoCurrency&&qrCurrency!==qoCurrency){out.quarterFinancialCurrency=null}
   else{
    const reportingCurrency=qrCurrency||qoCurrency||reportingCurrencyFor(symbol,market);
    out.quarterFinancialCurrency=reportingCurrency;
    const conversion=await currencyToJPY(reportingCurrency);
    if(conversion){
     out.quarterFxRateJPY=conversion.rate;out.quarterFxDate=conversion.date;
     if(qv.length&&(!qrCurrency||qrCurrency===reportingCurrency))out.quarterRevenueJPY=out.quarterRevenue*conversion.rate;
     if(ov.length&&(!qoCurrency||qoCurrency===reportingCurrency))out.quarterOperatingIncomeJPY=out.quarterOperatingIncome*conversion.rate;
    }
   }
   if(Object.values(out).some(v=>v!=null&&!Array.isArray(v)))out.source.push("Yahoo fundamentals timeseries");
 }catch{}
 try{const modules="summaryDetail,defaultKeyStatistics,financialData,calendarEvents,earningsHistory";const j=await getJson(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`);const x=j?.quoteSummary?.result?.[0]||{},sd=x.summaryDetail||{},ks=x.defaultKeyStatistics||{},fd=x.financialData||{},ce=x.calendarEvents||{},eh=x.earningsHistory?.history||[];
   out.trailingPE=out.trailingPE??n(sd.trailingPE);out.forwardPE=out.forwardPE??n(ks.forwardPE);out.marketCap=out.marketCap??n(sd.marketCap);out.profitMargin=out.profitMargin??n(fd.profitMargins);out.revenueGrowth=out.revenueGrowth??n(fd.revenueGrowth);out.earningsGrowth=out.earningsGrowth??n(fd.earningsGrowth);out.recommendationKey=fd.recommendationKey||null;out.targetMeanPrice=n(fd.targetMeanPrice);out.nextEarningsDate=n(ce.earnings?.earningsDate?.[0])||null;const last=eh[0]||{};const est=n(last.epsEstimate),act=n(last.epsActual);if(est!=null&&act!=null&&est!==0)out.earningsSurprisePct=(act-est)/Math.abs(est);out.source.push("Yahoo quoteSummary");
 }catch{}
 try{const c=await chart(symbol,"1y"),m=c?.meta||{},price=n(m.regularMarketPrice),eps=n(m.epsTrailingTwelveMonths);if(out.trailingPE==null&&price!=null&&eps)out.trailingPE=price/eps}catch{}
 // Do not display a fictitious ¥0 target when USD/JPY is unavailable or invalid.
 const fx=market==="US"?await fxJPY():market==="JP"?1:null;
 const target=out.targetMeanPrice;
 const convertedTarget=target!==null&&target>0&&fx!==null&&fx>0?target*fx:null;
 out.targetMeanPriceJPY=convertedTarget!==null&&Number.isFinite(convertedTarget)?convertedTarget:null;
 out.unavailable=![out.trailingPE,out.forwardPE,out.marketCap,out.profitMargin,out.revenueGrowth,out.earningsGrowth,out.targetMeanPrice].some(v=>v!=null);
 res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");return res.status(200).json(out);
}