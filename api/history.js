const ALLOWED=new Set(["1mo","3mo","1y","5y"]);
async function getChart(symbol,range){
 const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?interval=1d&range="+range;
 const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0"}});if(!r.ok)throw Error("upstream");
 const j=await r.json();const result=j.chart?.result?.[0];if(!result)throw Error("empty");
 const byDate=new Map();
 for(const [i,t] of (result.timestamp||[]).entries()){
   const price=result.indicators?.quote?.[0]?.close?.[i];
   if(!Number.isFinite(t)||!Number.isFinite(price)||price<=0)continue;
   const dateObj=new Date(t*1000);
   if(!Number.isFinite(dateObj.getTime()))continue;
   byDate.set(dateObj.toISOString().slice(0,10),price);
 }
 const points=[...byDate].map(([date,price])=>({date,price})).sort((a,b)=>a.date.localeCompare(b.date));
 return {points,currency:result.meta?.currency||null};
}
export default async function handler(req,res){
 const symbol=String(req.query.symbol||"").trim().toUpperCase(),market=String(req.query.market||"JP"),range=String(req.query.range||"1mo");
 if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||!ALLOWED.has(range)||!["JP","US"].includes(market))return res.status(400).json({error:"invalid_request"});
 try{
   const [stock,rate]=await Promise.all([getChart(symbol,range),market==="US"?getChart("JPY=X",range):Promise.resolve(null)]);
   const points=stock.points,fx=rate?.points||[];
   if(!points.length)throw Error("empty");
   if(stock.currency!==(market==="US"?"USD":"JPY"))throw Error("unexpected_currency");
   if(market==="US"&&(rate.currency!=="JPY"||!fx.length||fx[0].date>points[0].date))throw Error("fx_unavailable");
   let lastFx=market==="US"?fx[0].price:1,fi=0;
   const converted=points.map(p=>{while(fi<fx.length&&fx[fi].date<=p.date){lastFx=fx[fi].price;fi++}return {date:p.date,priceJPY:Math.round(p.price*lastFx*100)/100}});
   res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
   return res.status(200).json({symbol,range,points:converted});
 }catch{return res.status(502).json({error:"history_unavailable",points:[]})}
}