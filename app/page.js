"use client";
import { useEffect, useMemo, useState } from "react";

const TABS = [
  { id: "all", label: "Toplam" },
  { id: "binance", label: "Binance" },
  { id: "us", label: "ABD" },
  { id: "bist", label: "BIST" },
];

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

export default function Page() {
  const [tab, setTab] = useState("all");
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
      const trades = ["binance", "us", "bist"].flatMap((k) =>
        (books[k].trades || []).map((t) => ({ ...t, market: k }))
      );
      const positions = ["binance", "us", "bist"].flatMap((k) =>
        (books[k].positions || []).map((p) => ({ ...p, market: k }))
      );
      trades.sort((a, b) => (a.time < b.time ? 1 : -1));
      return { positions, trades, book: null };
    }
    return {
      positions: (books[tab].positions || []).map((p) => ({ ...p, market: tab })),
      trades: [...(books[tab].trades || [])].reverse(),
      book: books[tab],
    };
  }, [state, tab, books]);

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
          <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
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
          {["binance", "us", "bist"].map((k) => {
            const b = books[k];
            const pnl = (b?.equity || 0) - (b?.start || 4000);
            return (
              <button key={k} className="mini" onClick={() => setTab(k)}>
                <strong>{k === "us" ? "ABD" : k.toUpperCase()}</strong>
                <em className={pnlClass(pnl)}>{money(b?.equity)}</em>
                <small className={pnlClass(pnl)}>{money(pnl)} • {b?.positions?.length || 0} açık</small>
              </button>
            );
          })}
        </section>
      )}

      <h2>Açık pozisyonlar</h2>
      <div className="table">
        <div className="row head">
          <span>Sembol</span><span>Vade</span><span>Miktar</span><span>Giriş</span><span>Şimdi</span><span>K/Z</span>
        </div>
        {view?.positions?.length ? view.positions.map((p) => {
          const px = quotes[p.symbol] ?? p.entry;
          const u = p.qty_left * (px - p.entry);
          return (
            <div key={p.id} className="row">
              <span>
                <b>{p.symbol}</b>
                <small>{p.market} • {p.bucket}</small>
              </span>
              <span>{p.horizon}</span>
              <span>{p.qty_left.toFixed(4)}</span>
              <span>{money(p.entry, 4)}</span>
              <span>{money(px, 4)}</span>
              <span className={pnlClass(u)}>{money(u)}</span>
            </div>
          );
        }) : <p className="muted">Açık pozisyon yok.</p>}
      </div>

      <h2>İşlem günlüğü</h2>
      <div className="log">
        {view?.trades?.length ? view.trades.map((t, i) => (
          <article key={i}>
            <div className="logh">
              <b className={t.action === "AL" ? "up" : "dn"}>{t.action}</b>
              <strong>{t.symbol}</strong>
              <span>{t.horizon} / {t.bucket}</span>
              <em>{t.time ? new Date(t.time).toLocaleString("tr-TR") : ""}</em>
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
        Yatırım tavsiyesi değildir. Sanal 4.000 USD × 3 piyasa. Fiyatlar Binance public API ve Yahoo Finance üzerinden çekilir.
        Altcoin hedef bütçe 1.200 USD, tavan 1.400 USD. Kaldıraç kollu 280 USD, bu fazda kapalı.
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
button{background:#1b2740;color:var(--tx);border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer}
nav{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
nav button{padding:8px 14px;border-radius:999px} nav button.on{background:#134e4a;border-color:#2dd4bf}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.card span{display:block;color:var(--mut);font-size:12px} .card strong{display:block;font-size:22px;margin-top:6px}
.card small{color:var(--mut)}
.split{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.mini{text-align:left;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
.mini strong{display:block;font-size:12px;color:var(--mut)} .mini em{font-style:normal;font-size:20px;font-weight:700}
.mini small{display:block;margin-top:4px}
h2{margin:22px 0 8px;font-size:16px}
.table{border:1px solid var(--line);border-radius:12px;overflow:hidden}
.row{display:grid;grid-template-columns:1.4fr .7fr .8fr .9fr .9fr .8fr;gap:6px;padding:8px 10px;border-top:1px solid var(--line);font-size:13px;align-items:center}
.row.head{background:#0e1728;color:var(--mut);border-top:0;font-size:11px}
.row b{display:block} .row small{display:block;color:var(--mut);font-size:11px}
.log article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0}
.logh{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13px}
.logh em{margin-left:auto;color:var(--mut);font-style:normal;font-size:12px}
.log p{margin:8px 0;color:#d5deea;font-size:13px;line-height:1.45}
.logf{display:flex;gap:12px;flex-wrap:wrap;color:var(--mut);font-size:12px}
.up{color:var(--up)!important} .dn{color:var(--dn)!important} .flat{color:var(--tx)}
.muted{color:var(--mut)} .err{color:var(--dn)}
footer{margin-top:28px;color:var(--mut);font-size:12px;line-height:1.5}
@media(max-width:700px){
  .row,.row.head{grid-template-columns:1.2fr .8fr .8fr; }
  .row span:nth-child(2),.row span:nth-child(3),.row.head span:nth-child(2),.row.head span:nth-child(3){display:none}
  .split{grid-template-columns:1fr}
}
`;
