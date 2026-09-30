const fs = require("fs");
const path = require("path");

const STATE_PATH = path.join(process.cwd(), "data", "state.json");
const REMOTE = "https://raw.githubusercontent.com/Cihan-Uzun/trade-ajan-dashboard/main/data/state.json";

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "TradeAjanPaper/0.2" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function loadState() {
  try {
    return await fetchJson(REMOTE + "?t=" + Date.now());
  } catch (_) {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  }
}

async function binancePrices(symbols) {
  const q = encodeURIComponent(JSON.stringify(symbols));
  const rows = await fetchJson(
    `https://data-api.binance.vision/api/v3/ticker/price?symbols=${q}`
  );
  const out = {};
  for (const r of rows) out[r.symbol] = Number(r.price);
  return out;
}

async function yahooPrices(symbols) {
  const out = {};
  await Promise.all(
    symbols.map(async (sym) => {
      try {
        const data = await fetchJson(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            sym
          )}?interval=1d&range=5d`
        );
        const r = data.chart.result[0];
        const meta = r.meta;
        const px = meta.regularMarketPrice || meta.chartPreviousClose;
        if (px) out[sym] = px;
      } catch (_) {}
    })
  );
  return out;
}

function markBooks(state, quotes) {
  state.quotes = { ...state.quotes, ...quotes };
  for (const key of Object.keys(state.books)) {
    const book = state.books[key];
    let unreal = 0;
    let hold = 0;
    for (const p of book.positions) {
      const px = state.quotes[p.symbol] ?? p.entry;
      unreal += p.qty_left * (px - p.entry);
      hold += p.qty_left * px;
    }
    book.unrealized = unreal;
    book.realized = (book.trades || []).reduce((s, t) => s + (t.pnl || 0), 0);
    book.equity = book.cash + hold;
    book.open_count = book.positions.length;
  }
  state.updated_at = new Date().toISOString();
  return state;
}

function totals(state) {
  const keys = ["binance", "us", "bist"];
  const start = keys.reduce((s, k) => s + (state.books[k].start || 4000), 0);
  const equity = keys.reduce((s, k) => s + (state.books[k].equity || 0), 0);
  const cash = keys.reduce((s, k) => s + (state.books[k].cash || 0), 0);
  const unreal = keys.reduce((s, k) => s + (state.books[k].unrealized || 0), 0);
  const realized = keys.reduce((s, k) => s + (state.books[k].realized || 0), 0);
  return { start, equity, cash, unreal, realized, pnl: equity - start };
}

async function refreshState() {
  const state = await loadState();
  const binanceSyms = Object.keys(state.quotes || {}).filter((s) => s.endsWith("USDT"));
  const other = Object.keys(state.quotes || {}).filter((s) => !s.endsWith("USDT"));
  const extraB = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "APTUSDT"];
  const extraY = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "THYAO.IS", "GARAN.IS"];
  const [bp, yp] = await Promise.all([
    binancePrices([...new Set([...binanceSyms, ...extraB])]).catch(() => ({})),
    yahooPrices([...new Set([...other, ...extraY])]).catch(() => ({})),
  ]);
  return markBooks(state, { ...bp, ...yp });
}

module.exports = { loadState, refreshState, totals, markBooks };
