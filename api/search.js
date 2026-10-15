const JA_NAMES={"NVDA":"エヌビディア","AMAT":"アプライド マテリアルズ","AAPL":"アップル","MSFT":"マイクロソフト","GOOGL":"アルファベット","AMZN":"アマゾン","META":"メタ・プラットフォームズ","TSLA":"テスラ","AVGO":"ブロードコム","QCOM":"クアルコム","8035.T":"東京エレクトロン","7974.T":"任天堂","2802.T":"味の素","8001.T":"伊藤忠商事","7011.T":"三菱重工業","7012.T":"川崎重工業","7701.T":"島津製作所","5332.T":"TOTO","7203.T":"トヨタ自動車","6758.T":"ソニーグループ","6501.T":"日立製作所","6702.T":"富士通","6502.T":"東芝"};
const ALIASES={"トヨタ":"7203.T","ソニー":"6758.T","東京エレクトロン":"8035.T","東エレ":"8035.T","任天堂":"7974.T","味の素":"2802.T","伊藤忠":"8001.T","三菱重工":"7011.T","川崎重工":"7012.T","島津":"7701.T","toto":"5332.T","日立":"6501.T","富士通":"6702.T","エヌビディア":"NVDA","アプライドマテリアルズ":"AMAT","クアルコム":"QCOM"};
function normalize(s){return String(s).normalize("NFKC").toLowerCase().replace(/[\s・　]/g,"")}
export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();
  const market = String(req.query.market || "JP");
  const alias=Object.entries(ALIASES).find(([name])=>normalize(q)===normalize(name));
  const lookup=alias?alias[1]:q;
  const normalized=normalize(q);
  const knownSymbol=alias?.[1] || Object.keys(JA_NAMES).find(s=>normalize(s)===normalized || normalize(JA_NAMES[s])===normalized || (s.endsWith(".T")&&normalize(s.slice(0,-2))===normalized));
  const matchesMarket=s=>market==="JP"?s.endsWith(".T"):market==="US"?!s.includes("."):false;

  if (!q) {
    return res.status(200).json({ results: [] });
  }

  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(lookup)}` +
      `&quotesCount=12&newsCount=0`;

    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    if (!r.ok) {
      throw new Error("upstream");
    }

    const data = await r.json();

    let results = (data.quotes || []).filter(
      (x) => x.quoteType === "EQUITY"
    );

    if (market === "JP") {
      results = results.filter(
        (x) => /\.T$/.test(x.symbol)
      );
    } else {
      results = results.filter(
        (x) => !/\.[A-Z]{1,4}$/.test(x.symbol)
      );
    }

    if(knownSymbol&&matchesMarket(knownSymbol)&&!results.some(x=>x.symbol===knownSymbol))results.unshift({symbol:knownSymbol,quoteType:"EQUITY"});
    results = results.slice(0, 8).map((x) => ({
      symbol: x.symbol,
      name: JA_NAMES[x.symbol] || x.longname || x.shortname || x.symbol
    }));

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json({ results });

  } catch (e) {
    if(knownSymbol&&matchesMarket(knownSymbol)){
      res.setHeader("Cache-Control","no-store");
      return res.status(200).json({results:[{symbol:knownSymbol,name:JA_NAMES[knownSymbol]||knownSymbol}],degraded:true});
    }
    return res.status(502).json({
      error: "search_failed",
      results: []
    });
  }
}
