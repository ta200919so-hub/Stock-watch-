async function getJson(url){const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});if(!r.ok)throw new Error("upstream_"+r.status);return r.json()}
const n=v=>{if(v==null||v==="")return null;const x=Number(v?.raw??v);return Number.isFinite(x)?x:null};
async function chart(symbol,range="1y"){const j=await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`);return j?.chart?.result?.[0]||null}
async function timeseries(symbol,types){const now=Math.floor(Date.now()/1000),start=now-86400*900;const j=await getJson(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?symbol=${encodeURIComponent(symbol)}&type=${types.join(",")}&period1=${start}&period2=${now}`);return j?.timeseries?.result||[]}
const datedFinancial=e=>typeof e?.asOfDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(e.asOfDate);
function financialEntries(entries){
 const valid=(Array.isArray(entries)?entries:[]).filter(e=>n(e?.reportedValue)!==null);
 const dated=valid.filter(datedFinancial);
 return dated.length?dated.sort((a,b)=>a.asOfDate.localeCompare(b.asOfDate)):valid;
}
function priorAnnual(entries){
 const current=entries[entries.length-1];if(!current)return null;
 if(!datedFinancial(current))return entries[entries.length-2]||null;
 const now=Date.parse(current.asOfDate);
 return [...entries.slice(0,-1)].reverse().find(e=>{
  const days=(now-Date.parse(e.asOfDate))/86400000;
  return days>=330&&days<=400;
 })||null;
}
const latest=(rows,type)=>{const r=rows.find(x=>x.meta?.type?.[0]===type||x[type]);const a=financialEntries(r?.[type]);return a.length?n(a[a.length-1]?.reportedValue):null};
// Compare YoY values only when the two quarters have compatible reporting
// currencies; mixed units must not produce a misleading growth percentage.
function entryCurrencyInfo(entry){
 const codes=new Set();
 const explicit=[entry?.currencyCode,entry?.currency,entry?.reportedValue?.currencyCode]
  .filter(code=>code!=null&&code!=="");
 for(const code of explicit){
  if(typeof code!=="string"||!/^[A-Z]{3}$/.test(code))return {currency:null,conflict:true};
  codes.add(code);
 }
 return {currency:codes.size===1?[...codes][0]:null,conflict:codes.size>1};
}
// Yahoo quarterly entries may be unsorted or omit intermediate quarters.
// Compare dated observations approximately one year apart, not array positions.
function quarterSnapshot(entries){
 const valid=(Array.isArray(entries)?entries:[]).map(entry=>({
  date:typeof entry?.asOfDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(entry.asOfDate)?entry.asOfDate:null,
  value:n(entry?.reportedValue),
  currencyInfo:entryCurrencyInfo(entry)
 })).filter(x=>x.value!==null);
 const dated=valid.some(x=>x.date!==null);
 const ordered=dated?valid.filter(x=>x.date!==null).sort((a,b)=>a.date.localeCompare(b.date)):valid;
 const current=ordered[ordered.length-1];
 if(!current)return {value:null,growth:null};
 let previous=null;
 if(dated){
  const now=Date.parse(current.date);
  previous=[...ordered].reverse().find(x=>{
   const days=(now-Date.parse(x.date))/86400000;
   return days>=330&&days<=400;
  })||null;
 }else if(ordered.length>=5)previous=ordered[ordered.length-5];
 const comparable=previous&&!current.currencyInfo.conflict&&!previous.currencyInfo.conflict&&
  current.currencyInfo.currency===previous.currencyInfo.currency;
 return {value:current.value,growth:comparable&&previous.value?current.value/previous.value-1:null};
}
async function fxJPY(){try{const meta=(await chart("JPY=X","5d"))?.meta;const rate=n(meta?.regularMarketPrice);return meta?.currency==="JPY"&&rate!==null&&rate>0?rate:null}catch{return null}}
// A single quarterly series must not mix currencies: choosing the first
// currency would convert the latest observation with an unrelated FX rate.
function currencyInfoOf(entries){
 const codes=new Set();
 for(const entry of Array.isArray(entries)?entries:[]){
  if(n(entry?.reportedValue)===null)continue;
  // Validate all explicit currency fields, including nested metadata.
  const info=entryCurrencyInfo(entry);
  if(info.conflict)return {currency:null,conflict:true};
  if(info.currency)codes.add(info.currency);
 }
 // The conversion applies to the selected latest quarter, not a prior one.
 // An unlabeled latest value cannot safely inherit a historical currency.
 const ordered=financialEntries(entries);
 const current=ordered[ordered.length-1];
 if(current&&codes.size){
  const latestCodes=[current?.currencyCode,current?.currency,current?.reportedValue?.currencyCode]
   .filter(code=>code!=null&&code!=="");
  if(!latestCodes.length)return {currency:null,conflict:true};
 }
 return {currency:codes.size===1?[...codes][0]:null,conflict:codes.size>1};
}
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
  if(c?.meta?.currency==="JPY"&&rate!==null&&rate>0)return {rate,date:time?new Date(time*1000).toISOString().slice(0,10):null};
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
   const rev=financialEntries(rows.find(x=>x.annualTotalRevenue)?.annualTotalRevenue),ni=financialEntries(rows.find(x=>x.annualNetIncomeContinuousOperations)?.annualNetIncomeContinuousOperations);
   if(rev.length){
    const current=rev[rev.length-1],previous=priorAnnual(rev);
    const a=n(current?.reportedValue),b=n(previous?.reportedValue);
    if(a!=null&&b)out.revenueGrowth=a/b-1;
    // Do not mix revenue and net income from different fiscal years.
    const matchingIncome=datedFinancial(current)?ni.findLast(e=>e.asOfDate===current.asOfDate):ni[ni.length-1];
    const income=n(matchingIncome?.reportedValue);
    if(a&&income!=null)out.profitMargin=income/a;
   }
   const eps=financialEntries(rows.find(x=>x.annualDilutedEPS)?.annualDilutedEPS);
   if(eps.length>1){const a=n(eps[eps.length-1]?.reportedValue),b=n(priorAnnual(eps)?.reportedValue);if(a!=null&&b)out.earningsGrowth=a/b-1}
   const qr=rows.find(x=>x.quarterlyTotalRevenue)?.quarterlyTotalRevenue||[],qo=rows.find(x=>x.quarterlyOperatingIncome)?.quarterlyOperatingIncome||[];
   const revenue=quarterSnapshot(qr),operating=quarterSnapshot(qo);
   out.quarterRevenue=revenue.value;out.quarterRevenueGrowth=revenue.growth;
   out.quarterOperatingIncome=operating.value;out.quarterOperatingIncomeGrowth=operating.growth;
   const qrInfo=currencyInfoOf(qr),qoInfo=currencyInfoOf(qo);
   const qrCurrency=qrInfo.currency,qoCurrency=qoInfo.currency;
   // The stock's trading currency is not necessarily its financial reporting currency.
   // Never silently treat EUR/USD reports as JPY or use a fabricated FX rate.
   if(qrInfo.conflict||qoInfo.conflict||(qrCurrency&&qoCurrency&&qrCurrency!==qoCurrency)){out.quarterFinancialCurrency=null}
   else{
    const reportingCurrency=qrCurrency||qoCurrency||reportingCurrencyFor(symbol,market);
    out.quarterFinancialCurrency=reportingCurrency;
    const conversion=await currencyToJPY(reportingCurrency);
    if(conversion){
     out.quarterFxRateJPY=conversion.rate;out.quarterFxDate=conversion.date;
     // If only one series declares a currency, do not assume the other
     // unlabeled series uses it. Fallback is allowed only when both are unlabeled.
     const bothUnlabeled=qrCurrency===null&&qoCurrency===null;
     if(out.quarterRevenue!==null&&(qrCurrency===reportingCurrency||bothUnlabeled))out.quarterRevenueJPY=out.quarterRevenue*conversion.rate;
     if(out.quarterOperatingIncome!==null&&(qoCurrency===reportingCurrency||bothUnlabeled))out.quarterOperatingIncomeJPY=out.quarterOperatingIncome*conversion.rate;
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
 // Quarterly-only results are still usable even when Yahoo blocks annual/valuation endpoints.
 out.unavailable=![out.trailingPE,out.forwardPE,out.marketCap,out.profitMargin,out.revenueGrowth,out.earningsGrowth,out.targetMeanPrice,out.targetMeanPriceJPY,out.quarterRevenue,out.quarterOperatingIncome,out.quarterRevenueJPY,out.quarterOperatingIncomeJPY,out.quarterRevenueGrowth,out.quarterOperatingIncomeGrowth,out.earningsSurprisePct].some(v=>v!=null);
 res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");return res.status(200).json(out);
}