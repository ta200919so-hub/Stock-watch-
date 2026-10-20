function buildHistoryChart(points){
  if(!Array.isArray(points))return null;
  const byDate=new Map();
  for(const p of points){
    if(!p||typeof p.date!=="string"||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(p.date)||!Number.isFinite(p.priceJPY)||p.priceJPY<=0)continue;
    byDate.set(p.date,p.priceJPY);
  }
  const rows=[...byDate].sort((a,b)=>a[0].localeCompare(b[0]));
  if(rows.length<2)return null;
  const values=rows.map(x=>x[1]),low=Math.min(...values),high=Math.max(...values);
  const pad=Math.max((high-low)*0.06,high*0.005,0.01);
  const min=Math.max(0,low-pad),max=high+pad,span=max-min;
  const left=65,right=348,top=12,bottom=163;
  const x=i=>left+(right-left)*i/(rows.length-1);
  const y=v=>bottom-(v-min)/span*(bottom-top);
  const fmt=v=>"¥"+Math.round(v).toLocaleString("ja-JP");
  const ticks=[0,1,2,3,4].map(i=>{
    const v=min+(max-min)*i/4,py=y(v).toFixed(1);
    return `<line x1="${left}" y1="${py}" x2="${right}" y2="${py}" stroke="#536079" stroke-opacity=".35"/><text x="${left-6}" y="${(+py+4).toFixed(1)}" text-anchor="end" font-size="10" fill="#a8b6d2">${fmt(v)}</text>`;
  }).join("");
  const dateLabel=d=>d.slice(2,4)+"/"+d.slice(5,7)+"/"+d.slice(8,10);
  const labels=[0,Math.floor((rows.length-1)/2),rows.length-1].filter((v,i,a)=>a.indexOf(v)===i).map((i,k,a)=>`<text x="${x(i).toFixed(1)}" y="185" text-anchor="${k===0?"start":k===a.length-1?"end":"middle"}" font-size="11" fill="#a8b6d2">${dateLabel(rows[i][0])}</text>`).join("");
  const coords=rows.map(([date,price],i)=>x(i).toFixed(2)+","+y(price).toFixed(2)).join(" ");
  return `<svg viewBox="0 0 360 200" role="img" aria-label="株価推移（円）"><title>株価推移（円）</title>${ticks}<polyline points="${coords}" fill="none" stroke="#7c8cff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${labels}</svg><div class="chart-labels"><span>最新 ${fmt(values[values.length-1])}</span></div>`;
}
