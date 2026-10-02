"use client";
import { useEffect, useMemo, useState } from "react";

const TABS = [
  { id: "all", label: "Toplam" },
  { id: "binance", label: "Binance" },
  { id: "us", label: "ABD" },
  { id: "bist", label: "BIST" },
];
const PERIODS = [
  { id: "day", label: "Günlük" },
  { id: "week", label: "Haftalık" },
  { id: "month", label: "Aylık" },
  { id: "all", label: "Tümü" },
];
const MARKETS = ["binance", "us", "bist"];

function money(n, d = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  const s = n < 0 ? "-" : "";
  return s + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pnlClass(n) {
  if (n > 0.005) return "up";
  if (n < -0.005) return "dn";
  return "flat";
}
function istYmd(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
function isClose(t) {
  const a = String(t.action || "").toUpperCase();
  return a === "SAT" || a === "SELL" || a === "KAPAT" || a === "TP" || a === "STOP";
}
function periodBounds(kind) {
  const now = new Date();
  const today = istYmd(now);
  if (kind === "all") return { start: "1970-01-01", end: today, label: "Tüm defter" };
  if (kind === "day") return { start: today, end: today, label: "Bugün · " + today };
  if (kind === "week") {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Istanbul", weekday: "short" }).format(now);
    const map = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const start = new Date(now.getTime() - (map[wd] ?? 0) * 86400000);
    return { start: istYmd(start), end: today, label: "Bu hafta · " + istYmd(start) + " → " + today };
  }
  return { start: today.slice(0, 8) + "01", end: today, label: "Bu ay · " + today.slice(0, 7) };
}
function inPeriod(iso, bounds) {
  if (!iso) return false;
  const y = istYmd(new Date(iso));
  return y >= bounds.start && y <= bounds.end;
}
function marketName(k) {
  if (k === "us") return "ABD";
  if (k === "bist") return "BIST";
  if (k === "binance") return "Binance";
  return k;
}

export default function Page() {
  const [tab, setTab] = useState("all");
  const [period, setPeriod] = useState("day");
  const [symbol, setSymbol] = useState("");
  const [payload, setPayload] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const r = await fetch("/api/state", { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "state");
      setPayload(j);
      setErr("");
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  const state = payload?.state;
  const books = state?.books || {};
  const quotes = state?.quotes || {};

  const view = useMemo(() => {
    if (!state) return null;
    if (tab === "all") {
      const trades = MARKETS.flatMap((k) => (books[k].trades || []).map((t) => ({ ...t, market: t.market || k })));
      const positions = MARKETS.flatMap((k) => (books[k].positions || []).map((p) => ({ ...p, market: k })));
      trades.sort((a, b) => (a.time < b.time ? 1 : -1));
      return { positions, trades, book: null };
    }
    return {
      positions: (books[tab].positions || []).map((p) => ({ ...p, market: tab })),
      trades: [...(books[tab].trades || [])].map((t) => ({ ...t, market: t.market || tab })).reverse(),
      book: books[tab],
    };
  }, [state, tab, books]);

  const report = useMemo(() => {
    if (!view) return null;
    const bounds = periodBounds(period);
    const trades = view.trades.filter((t) => inPeriod(t.time, bounds));
    const closes = trades.filter(isClose);
    const realized = closes.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    const fees = trades.reduce((s, t) => s + (Number(t.fee) || 0), 0);
    const wins = closes.filter((t) => (Number(t.pnl) || 0) > 0).length;
    const losses = closes.filter((t) => (Number(t.pnl) || 0) < 0).length;
    const bySym = {};
    for (const t of trades) {
      const row = bySym[t.symbol] || { symbol: t.symbol, market: t.market, realized: 0, fees: 0, buys: 0, closes: 0, wins: 0 };
      row.fees += Number(t.fee) || 0;
      if (isClose(t)) {
        row.realized += Number(t.pnl) || 0;
        row.closes += 1;
        if ((Number(t.pnl) || 0) > 0) row.wins += 1;
      } else row.buys += 1;
      bySym[t.symbol] = row;
    }
    const ranked = Object.values(bySym).sort((a, b) => b.realized - a.realized);
    return { bounds, trades, closes, realized, fees, wins, losses, ranked, opens: trades.length - closes.length };
  }, [view, period]);

  const symbols = useMemo(() => {
    if (!view) return [];
    const set = new Map();
    for (const p of view.positions) set.set(p.symbol, p.market);
    for (const t of view.trades) set.set(t.symbol, t.market);
    return [...set.entries()].map(([symbol, market]) => ({ symbol, market })).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [view]);

  const picked = useMemo(() => {
    if (!view || !symbol) return null;
    const trades = view.trades.filter((t) => t.symbol === symbol);
    const positions = view.positions.filter((p) => p.symbol === symbol);
    const closes = trades.filter(isClose);
    const realized = closes.reduce((s, t) => s + (Number(t.pnl) || 0), 0) + positions.reduce((s, p) => s + (Number(p.realized) || 0), 0);
    const fees = trades.reduce((s, t) => s + (Number(t.fee) || 0), 0) + positions.reduce((s, p) => s + (Number(p.fee_open) || 0), 0);
    const unreal = positions.reduce((s, p) => {
      const px = quotes[p.symbol] ?? p.entry;
      return s + p.qty_left * (px - p.entry);
    }, 0);
    return { trades, positions, closes, realized, fees, unreal, wins: closes.filter((t) => (t.pnl || 0) > 0).length };
  }, [view, symbol, quotes]);

  const totals = payload?.totals;

  return (
    <div className="wrap">
      <style>{CSS}</style>
      <header>
        <div>
          <div className="kicker">PAPER • GERÇEK VERİ • CANLI API YOK</div>
          <h1>Trade Ajanı</h1>
        </div>
        <div className="meta">
          <span>{state ? new Date(state.updated_at).toLocaleString("tr-TR") : "…"}</span>
          <button onClick={load}>Yenile</button>
        </div>
      </header>

      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => { setTab(t.id); setSymbol(""); }}>
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <p className="muted">Yükleniyor…</p>}
      {err && <p className="err">Veri hatası: {err}</p>}

      {totals && (
        <section className="cards">
          <Card label="Toplam özsermaye" value={money(tab === "all" ? totals.equity : view?.book?.equity)} sub={`başlangıç ${money(tab === "all" ? totals.start : 4000)}`} />
          <Card label="Nakit" value={money(tab === "all" ? totals.cash : view?.book?.cash)} />
          <Card label="Açık K/Z" value={money(tab === "all" ? totals.unreal : view?.book?.unrealized)} tone={pnlClass(tab === "all" ? totals.unreal : view?.book?.unrealized)} />
          <Card label="Gerçekleşen K/Z" value={money(tab === "all" ? totals.realized : view?.book?.realized)} tone={pnlClass(tab === "all" ? totals.realized : view?.book?.realized)} />
          {tab === "binance" && (
            <Card label="Altcoin kullanılan" value={money(books.binance.alt_used || 0)} sub="hedef $1.200 / tavan $1.400" />
          )}
        </section>
      )}

      {tab === "all" && totals && (
        <section className="split">
          {MARKETS.map((k) => {
            const b = books[k];
            const pnl = (b?.equity || 0) - (b?.start || 4000);
            return (
              <button key={k} className="mini" onClick={() => setTab(k)}>
                <strong>{marketName(k)}</strong>
                <em className={pnlClass(pnl)}>{money(b?.equity)}</em>
                <small className={pnlClass(pnl)}>{money(pnl)} • {b?.positions?.length || 0} açık</small>
              </button>
            );
          })}
        </section>
      )}

      {report && (
        <section className="report">
          <div className="sec-h">
            <h2>Kapanış raporu</h2>
            <div className="pills">
              {PERIODS.map((p) => (
                <button key={p.id} className={period === p.id ? "on" : ""} onClick={() => setPeriod(p.id)}>{p.label}</button>
              ))}
            </div>
          </div>
          <p className="muted">{report.bounds.label} · İstanbul saati · sadece kapanan işlemler</p>
          <section className="cards">
            <Card label="Kapanan K/Z" value={money(report.realized)} tone={pnlClass(report.realized)} sub={`${report.closes.length} kapanış`} />
            <Card label="Komisyon" value={money(report.fees)} sub={`${report.trades.length} işlem satırı`} />
            <Card label="Kazanan / kaybeden" value={`${report.wins} / ${report.losses}`} sub={report.closes.length ? `isabet %${Math.round((report.wins / report.closes.length) * 100)}` : "kapanış yok"} />
            <Card label="Yeni giriş" value={String(report.opens)} sub="bu dönemde AL" />
          </section>
          {report.closes.length === 0 && (
            <p className="note">Bu dönemde kapanış yok. Açık pozisyonların K/Z’si henüz gerçekleşmedi; aşağıda hisse seçince açık K/Z de görünür.</p>
          )}
          <div className="table">
            <div className="row rank head">
              <span>Hisse</span><span>Piyasa</span><span>Alış</span><span>Kapanış</span><span>Komisyon</span><span>Kapanan K/Z</span>
            </div>
            {report.ranked.length ? report.ranked.map((r) => (
              <button key={r.symbol} className="row rank link" onClick={() => setSymbol(r.symbol)}>
                <span><b>{r.symbol}</b></span>
                <span>{marketName(r.market)}</span>
                <span>{r.buys}</span>
                <span>{r.closes}</span>
                <span>{money(r.fees)}</span>
                <span className={pnlClass(r.realized)}>{money(r.realized)}</span>
              </button>
            )) : <p className="muted pad">Bu dönemde işlem yok.</p>}
          </div>
        </section>
      )}

      <section className="report">
        <div className="sec-h">
          <h2>Hisse seç</h2>
        </div>
        <div className="filters">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
            <option value="">Tüm hisseler</option>
            {symbols.map((s) => (
              <option key={s.symbol} value={s.symbol}>{s.symbol} · {marketName(s.market)}</option>
            ))}
          </select>
          {symbol && <button onClick={() => setSymbol("")}>Filtreyi kaldır</button>}
        </div>
        {picked && (
          <section className="cards">
            <Card label={symbol + " kapanan"} value={money(picked.realized)} tone={pnlClass(picked.realized)} sub={`${picked.closes.length} kapanış · ${picked.wins} kazanç`} />
            <Card label="Açık K/Z" value={money(picked.unreal)} tone={pnlClass(picked.unreal)} sub={`${picked.positions.length} açık pozisyon`} />
            <Card label="Komisyon" value={money(picked.fees)} sub={`${picked.trades.length} işlem`} />
          </section>
        )}
      </section>

      <h2>Açık pozisyonlar{symbol ? " · " + symbol : ""}</h2>
      <div className="table">
        <div className="row head">
          <span>Sembol</span><span>Vade</span><span>Miktar</span><span>Giriş</span><span>Şimdi</span><span>K/Z</span>
        </div>
        {(symbol ? view?.positions?.filter((p) => p.symbol === symbol) : view?.positions)?.length
          ? (symbol ? view.positions.filter((p) => p.symbol === symbol) : view.positions).map((p) => {
            const px = quotes[p.symbol] ?? p.entry;
            const u = p.qty_left * (px - p.entry);
            return (
              <button key={p.id} className="row link" onClick={() => setSymbol(p.symbol)}>
                <span>
                  <b>{p.symbol}</b>
                  <small>{marketName(p.market)} • {p.bucket}</small>
                </span>
                <span>{p.horizon}</span>
                <span>{Number(p.qty_left).toFixed(4)}</span>
                <span>{money(p.entry, 4)}</span>
                <span>{money(px, 4)}</span>
                <span className={pnlClass(u)}>{money(u)}</span>
              </button>
            );
          }) : <p className="muted pad">Açık pozisyon yok.</p>}
      </div>

      <h2>İşlem günlüğü{symbol ? " · " + symbol : ""}</h2>
      <div className="log">
        {(symbol ? view?.trades?.filter((t) => t.symbol === symbol) : view?.trades)?.length
          ? (symbol ? view.trades.filter((t) => t.symbol === symbol) : view.trades).map((t, i) => (
            <article key={t.id || i}>
              <div className="logh">
                <b className={t.action === "AL" ? "up" : "dn"}>{t.action}</b>
                <strong>{t.symbol}</strong>
                <span>{marketName(t.market)} · {t.horizon} / {t.bucket}</span>
                <em>{t.time ? new Date(t.time).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" }) : ""}</em>
              </div>
              <p>{t.reason}</p>
              <div className="logf">
                <span>Adet {Number(t.qty).toFixed(4)}</span>
                <span>Fiyat {money(t.price, 4)}</span>
                <span>Komisyon {money(t.fee, 4)}</span>
                <span className={pnlClass(t.pnl || 0)}>K/Z {money(t.pnl || 0)}</span>
              </div>
            </article>
          )) : <p className="muted">Henüz işlem yok.</p>}
      </div>

      <footer>
        Yatırım tavsiyesi değildir. Sanal 4.000 USD × 3 piyasa. Günlük / haftalık / aylık rapor İstanbul saatine göre kapanan işlemlerin gerçekleşen K/Z’sidir; açık pozisyon ayrıca gösterilir.
        Fiyatlar Binance public API ve Yahoo Finance üzerinden çekilir. Altcoin hedef 1.200 USD, tavan 1.400 USD.
      </footer>
    </div>
  );
}

function Card({ label, value, sub, tone }) {
  return (
    <div className="card">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

const CSS = `
:root { --bg:#0b1220; --card:#121b2d; --line:#243044; --tx:#e8eef8; --mut:#8ea0b8; --up:#34d399; --dn:#fb7185; --acc:#2dd4bf; }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--tx);font-family:Inter,system-ui,Segoe UI,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:18px 14px 48px}
header{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap}
h1{margin:4px 0 0;font-size:28px} .kicker{color:var(--acc);font-size:11px;letter-spacing:.12em;font-weight:700}
.meta{display:flex;gap:8px;align-items:center;color:var(--mut);font-size:12px}
button,select{background:#1b2740;color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit}
nav,.pills{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
nav button,.pills button{padding:8px 14px;border-radius:999px}
nav button.on,.pills button.on{background:#134e4a;border-color:#2dd4bf}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.card span{display:block;color:var(--mut);font-size:12px} .card strong{display:block;font-size:22px;margin-top:6px}
.card small{color:var(--mut)}
.split{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.mini{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.mini strong{display:block;font-size:12px;color:var(--mut)} .mini em{font-style:normal;font-size:20px;font-weight:700}
.mini small{display:block;margin-top:4px}
h2{margin:22px 0 8px;font-size:16px}
.sec-h{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
.sec-h h2{margin:8px 0}
.report{margin-top:8px}
.note{background:#1c2436;border:1px solid var(--line);border-radius:10px;padding:10px 12px;color:#d5deea;font-size:13px}
.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 12px}
select{min-width:220px}
.table{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.row{display:grid;grid-template-columns:1.4fr .7fr .8fr .9fr .9fr .8fr;gap:6px;padding:8px 10px;border-top:1px solid var(--line);font-size:13px;align-items:center;width:100%;text-align:left;background:transparent;border-left:0;border-right:0;border-radius:0}
.row.rank{grid-template-columns:1.3fr .8fr .6fr .7fr .9fr 1fr}
.row.head{background:#0e1728;color:var(--mut);border-top:0;font-size:11px}
.row.link:hover{background:#162033}
.row b{display:block} .row small{display:block;color:var(--mut);font-size:11px}
.pad{padding:10px}
.log article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0}
.logh{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px}
.logh em{margin-left:auto;color:var(--mut);font-style:normal;font-size:12px}
.log p{margin:8px 0;color:#d5deea;font-size:13px;line-height:1.45}
.logf{display:flex;gap:12px;flex-wrap:wrap;color:var(--mut);font-size:12px}
.up{color:var(--up)!important} .dn{color:var(--dn)!important} .flat{color:var(--tx)}
.muted{color:var(--mut)} .err{color:var(--dn)}
footer{margin-top:28px;color:var(--mut);font-size:12px;line-height:1.5}
@media(max-width:700px){
  .row,.row.head{grid-template-columns:1.2fr .8fr .8fr}
  .row span:nth-child(2),.row span:nth-child(3),.row.head span:nth-child(2),.row.head span:nth-child(3){display:none}
  .row.rank,.row.rank.head{grid-template-columns:1.2fr .7fr .9fr}
  .row.rank span:nth-child(2),.row.rank span:nth-child(3),.row.rank span:nth-child(4),
  .row.rank.head span:nth-child(2),.row.rank.head span:nth-child(3),.row.rank.head span:nth-child(4){display:none}
  .split{grid-template-columns:1fr}
}
`;
