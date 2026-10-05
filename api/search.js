export default async function handler(req, res) {
  const q = String(req.query.q || "").trim();
  const market = String(req.query.market || "JP");

  if (!q) {
    return res.status(200).json({ results: [] });
  }

  try {
    const url =
      `https://query1.finance.yahoo.com/v1/finance/search` +
      `?q=${encodeURIComponent(q)}` +
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

    results = results.slice(0, 8).map((x) => ({
      symbol: x.symbol,
      name: x.longname || x.shortname || x.symbol
    }));

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );

    return res.status(200).json({ results });

  } catch (e) {
    return res.status(502).json({
      error: "search_failed",
      results: []
    });
  }
}
