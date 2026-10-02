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

const BIST_CLOSED = new Set(["2026-01-01", "2026-03-20", "2026-03-21", "2026-03-22", "2026-04-23", "2026-05-01", "2026-05-19", "2026-05-27", "2026-05-28", "2026-05-29", "2026-05-30", "2026-07-15", "2026-10-29"]);
const BIST_HALF = new Set(["2026-03-19", "2026-05-26", "2026-10-28"]);
const US_CLOSED = new Set(["2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25"]);
const US_EARLY = new Set(["2026-11-27", "2026-12-24"]);

function zoned(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const weekday = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }[get("weekday")] ?? 0;
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday,
    clock: `${get("hour")}:${get("minute")}`,
  };
}

function sessionOf(market, now = new Date()) {
  if (market === "binance") return { open: true, label: "Binance 7/24 açık" };
  if (market === "bist") {
    const z = zoned(now, "Europe/Istanbul");
    if (z.weekday === 0 || z.weekday === 6) return { open: false, label: "BIST kapalı · hafta sonu" };
    if (BIST_CLOSED.has(z.ymd)) return { open: false, label: "BIST kapalı · resmi tatil" };
    const end = BIST_HALF.has(z.ymd) ? 13 * 60 : 18 * 60;
    const open = z.minutes >= 10 * 60 && z.minutes < end;
    return { open, label: open ? `BIST açık · ${z.clock} TSİ` : `BIST kapalı · seans 10:00–${BIST_HALF.has(z.ymd) ? "13:00" : "18:00"}` };
  }
  const z = zoned(now, "America/New_York");
  if (z.weekday === 0 || z.weekday === 6) return { open: false, label: "ABD kapalı · hafta sonu" };
  if (US_CLOSED.has(z.ymd)) return { open: false, label: "ABD kapalı · tatil" };
  const end = US_EARLY.has(z.ymd) ? 13 * 60 : 16 * 60;
  const open = z.minutes >= 9 * 60 + 30 && z.minutes < end;
  return { open, label: open ? `ABD açık · ${z.clock} ET` : "ABD kapalı · seans 09:30–16:00 ET" };
}

function Bars({ rows }) {
  if (!rows.length) return <p className="muted">Bu dönemde çizilecek kapanış yok.</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.01);
  return (
    <div className="chart">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="bl">{r.label}</span>
          <div className="track">
            <i className={r.value >= 0 ? "bar upb" : "bar dnb"} style={{ width: `${Math.max(6, (Math.abs(r.value) / max) * 100)}%` }} />
          </div>
          <span className={pnlClass(r.value)}>{money(r.value)}</span>
        </div>
      ))}
    </div>
  );
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

  const dayBars = useMemo(() => {
    if (!report) return [];
    const map = {};
    for (const t of report.closes) {
      const day = istYmd(new Date(t.time));
      map[day] = (map[day] || 0) + (Number(t.pnl) || 0);
    }
    return Object.entries(map).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([label, value]) => ({ label: label.slice(5), value }));
  }, [report]);
  const symBars = useMemo(() => {
    if (!report) return [];
    return report.ranked.filter((r) => r.closes > 0).map((r) => ({ label: r.symbol.replace(".IS", ""), value: r.realized }));
  }, [report]);
  const sessions = useMemo(() => ({
    binance: sessionOf("binance"),
    us: sessionOf("us"),
    bist: sessionOf("bist"),
  }), [payload]);

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

      <div className="sessions">
        {MARKETS.map((k) => (
          <span key={k} className={sessions[k].open ? "sess on" : "sess"}>
            {sessions[k].label}
          </span>
        ))}
      </div>

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
          <div className="charts">
            <div>
              <h3>Günlük kapanan K/Z</h3>
              <Bars rows={dayBars} />
            </div>
            <div>
              <h3>Hisse kapanan K/Z</h3>
              <Bars rows={symBars} />
            </div>
          </div>
          <h3>Kapanan işlemler</h3>
          <div className="log">
            {report.closes.length ? report.closes.map((t, i) => (
              <article key={t.id || i}>
                <div className="logh">
                  <b className="dn">{t.action}</b>
                  <strong>{t.symbol}</strong>
                  <span>{marketName(t.market)} · {t.horizon}</span>
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
            )) : <p className="muted">Bu dönemde kapanan işlem yok.</p>}
          </div>
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
.sessions{display:flex;gap:8px;flex-wrap:wrap;margin:-6px 0 12px}
.sess{font-size:12px;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:4px 10px}
.sess.on{color:var(--up);border-color:#14532d}
.charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.charts h3,h3{margin:14px 0 8px;font-size:14px}
.chart{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px}
.bar-row{display:grid;grid-template-columns:72px 1fr 72px;gap:8px;align-items:center;margin:6px 0;font-size:12px}
.bl{color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.track{height:8px;background:#0e1728;border-radius:99px;overflow:hidden}
.bar{display:block;height:8px;border-radius:99px}
.upb{background:var(--up)} .dnb{background:var(--dn)}
footer{margin-top:28px;color:var(--mut);font-size:12px;line-height:1.5}
@media(max-width:700px){
  .row,.row.head{grid-template-columns:1.2fr .8fr .8fr}
  .row span:nth-child(2),.row span:nth-child(3),.row.head span:nth-child(2),.row.head span:nth-child(3){display:none}
  .row.rank,.row.rank.head{grid-template-columns:1.2fr .7fr .9fr}
  .row.rank span:nth-child(2),.row.rank span:nth-child(3),.row.rank span:nth-child(4),
  .row.rank.head span:nth-child(2),.row.rank.head span:nth-child(3),.row.rank.head span:nth-child(4){display:none}
  .split,.charts{grid-template-columns:1fr}
  .bar-row{grid-template-columns:58px 1fr 64px}
}
`;
