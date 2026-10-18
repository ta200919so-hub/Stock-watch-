async function chart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;

  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" }
  });

  if (!r.ok) throw new Error("quote");

  const j = await r.json();
  return j.chart?.result?.[0]?.meta;
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "").trim().toUpperCase();
  const market = String(req.query.market || "JP");

  if (!symbol) {
    return res.status(400).json({ error: "symbol_required" });
  }
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol) || !["JP", "US"].includes(market)) {
    return res.status(400).json({ error: "invalid_request" });
  }

  try {
    const meta = await chart(symbol);
    const raw = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose || meta?.previousClose || 0);
    const dayChangePct = Number.isFinite(prev) && prev > 0 ? (raw / prev - 1) * 100 : null;

    if (!Number.isFinite(raw) || raw <= 0) throw new Error("no_price");
    // Never treat a USD quote as JPY, or multiply an already-JPY quote by FX.
    if (meta?.currency !== (market === "US" ? "USD" : "JPY")) throw new Error("unexpected_currency");

    let fx = 1;
    let priceJPY = raw;

    if (market === "US") {
      const fxMeta = await chart("JPY=X");
      fx = Number(fxMeta?.regularMarketPrice);

      if (!Number.isFinite(fx) || fx <= 0 || fxMeta?.currency !== "JPY") throw new Error("no_fx");

      priceJPY = raw * fx;
    }

    res.setHeader(
      "Cache-Control",
      "s-maxage=60, stale-while-revalidate=120"
    );

    return res.status(200).json({
      symbol,
      rawPrice: raw,
      fx,
      priceJPY,
      currency: meta?.currency || null,
      marketTime: meta?.regularMarketTime || null,
      previousClose: prev || null,
      dayChangePct
    });
  } catch (e) {
    return res.status(502).json({ error: "quote_failed" });
  }
}
