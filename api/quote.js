async function chart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

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

  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol) || !["JP", "US"].includes(market)) {
    return res.status(400).json({ error: "invalid_request" });
  }

  try {
    const meta = await chart(symbol);
    const raw = Number(meta?.regularMarketPrice);
    // A one-day chart makes chartPreviousClose a prior-session close.
    // Prefer previousClose when valid, otherwise try chartPreviousClose.
    // Truthy invalid values (such as -1 or NaN) must not hide a valid fallback.
    const validClose = value => {
      if (value == null || value === "") return null;
      const number = Number(value);
      return Number.isFinite(number) && number > 0 ? number : null;
    };
    const prev = validClose(meta?.previousClose) ?? validClose(meta?.chartPreviousClose);
    const expectedCurrency = market === "US" ? "USD" : "JPY";
    // A valid price in the wrong currency would silently corrupt yen valuations.
    if (!Number.isFinite(raw) || raw <= 0 || meta?.currency !== expectedCurrency) {
      throw new Error("invalid_price_or_currency");
    }
    const dayChangePct = prev === null ? null : (raw / prev - 1) * 100;

    let fx = 1;
    let priceJPY = raw;

    if (market === "US") {
      const fxMeta = await chart("JPY=X");
      fx = Number(fxMeta?.regularMarketPrice);

      if (!Number.isFinite(fx) || fx <= 0 || fxMeta?.currency !== "JPY") {
        throw new Error("invalid_fx");
      }

      priceJPY = raw * fx;
    }
    if (!Number.isFinite(priceJPY) || priceJPY <= 0) throw new Error("invalid_yen_price");

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
      previousClose: prev,
      dayChangePct
    });
  } catch (e) {
    return res.status(502).json({ error: "quote_failed" });
  }
}
