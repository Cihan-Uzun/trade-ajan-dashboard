'use client';
import { useEffect, useState } from 'react';

export default function Page() {
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('genel');

  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(d => setState(d.state || d))
      .catch(e => setErr(e.message));
  }, []);

  if (err) return <div style={{padding:20, fontFamily:'system-ui', background:'#0b1220', color:'#e8eef8', minHeight:'100vh'}}>Veri hatası: {err}</div>;
  if (!state) return <div style={{padding:20, fontFamily:'system-ui', background:'#0b1220', color:'#e8eef8', minHeight:'100vh'}}>Yükleniyor...</div>;

  const books = state.books || {};
  const tabs = [
    {id: 'genel', label: 'Genel'},
    {id: 'binance', label: 'Binance'},
    {id: 'us', label: 'ABD'},
    {id: 'bist', label: 'BIST'},
    {id: 'tavan', label: 'Tavan'},
    {id: 'approvals', label: 'Onaylar'},
    {id: 'ledger', label: 'Defter'},
    {id: 'logs', label: 'Ajan Kayıtları'}
  ];

  const pnlColor = (n) => n > 0.005 ? '#34d399' : n < -0.005 ? '#fb7185' : '#e8eef8';

  const renderBook = (key) => {
    const b = books[key] || {};
    return (
      <div className="panel">
        <h2>{key.toUpperCase()} Kitap</h2>
        <p>Başlangıç: ${b.start || 0} | Özsermaye: <span style={{color: pnlColor((b.equity||0)-(b.start||0))}}>${(b.equity||0).toFixed(2)}</span> | Nakit: ${(b.cash||0).toFixed(2)}</p>
        <p>Açık K/Z: <span style={{color: pnlColor(b.unrealized||0)}}>${(b.unrealized||0).toFixed(2)}</span> | Gerçekleşen K/Z: <span style={{color: pnlColor(b.realized||0)}}>${(b.realized||0).toFixed(2)}</span> | Açık pozisyon: {b.open_count || 0}</p>
        {key === 'tavan' && b.watch && <p>İzleme: {(b.watch || []).join(', ') || 'boş'}</p>}
        {key === 'tavan' && b.last_decision && <p>Son karar: {b.last_decision.action || '-'} ({b.last_decision.reason || ''})</p>}
        <h3>Pozisyonlar</h3>
        <ul>{(b.positions || []).map((p,i) => <li key={i}>{p.symbol} adet:{p.qty_left} giriş:{p.entry}</li>)}</ul>
        <h3>Son işlemler</h3>
        <ul>{(b.trades || []).slice(-5).map((t,i) => <li key={i}>{t.symbol} {t.side} k/z:<span style={{color: pnlColor(t.pnl||0)}}>${(t.pnl||0).toFixed(2)}</span></li>)}</ul>
      </div>
    );
  };

  return (
    <div className="wrap">
      <style>{`
        :root { --bg:#0b1220; --card:#121b2d; --line:#243044; --tx:#e8eef8; --mut:#8ea0b8; --up:#34d399; --dn:#fb7185; --acc:#2dd4bf; }
        *{box-sizing:border-box}
        body{margin:0;background:var(--bg);color:var(--tx);font-family:Inter,system-ui,Segoe UI,sans-serif}
        .wrap{max-width:1100px;margin:0 auto;padding:18px 14px 48px}
        h1{margin:4px 0 0;font-size:28px}
        .kicker{color:var(--acc);font-size:11px;letter-spacing:.12em;font-weight:700}
        .meta{color:var(--mut);font-size:13px;margin:8px 0 16px}
        nav{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
        nav button{background:#1b2740;color:var(--tx);border:1px solid var(--line);border-radius:999px;padding:8px 14px;cursor:pointer}
        nav button.on{background:#134e4a;border-color:#2dd4bf}
        .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
        .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px}
        .card h3{margin:0 0 8px;font-size:14px;color:var(--mut)}
        .card p{margin:4px 0;font-size:14px}
        .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:8px}
        .panel h2,.panel h3{margin:12px 0 6px}
        .policy{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:20px}
        ul{padding-left:18px}
        li{margin:4px 0}
        .up{color:var(--up)} .dn{color:var(--dn)}
      `}</style>

      <div className="kicker">PAPER • GERÇEK VERİ • CANLI API YOK</div>
      <h1>Trade Ajanı</h1>
      <div className="meta">
        Kiracı: {state.tenant || 'default'} · Durum: {state.status} · Bütünlük: {state.integrity?.ok ? 'TAMAM' : 'HATA'} · {state.updated_at}
      </div>

      <nav>
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'genel' && (
        <div className="cards">
          {['binance', 'us', 'bist', 'tavan'].map(k => {
            const b = books[k] || {};
            const pnl = (b.equity || 0) - (b.start || 0);
            return (
              <div key={k} className="card">
                <h3>{k.toUpperCase()}</h3>
                <p>Özsermaye: <strong style={{color: pnlColor(pnl)}}>${(b.equity||0).toFixed(2)}</strong></p>
                <p>Açık K/Z: <span style={{color: pnlColor(b.unrealized||0)}}>${(b.unrealized||0).toFixed(2)}</span></p>
                <p>Gerçekleşen K/Z: <span style={{color: pnlColor(b.realized||0)}}>${(b.realized||0).toFixed(2)}</span></p>
                <p>Açık pozisyon: {b.open_count || 0}</p>
              </div>
            );
          })}
        </div>
      )}

      {['binance', 'us', 'bist', 'tavan'].includes(tab) && renderBook(tab)}

      {tab === 'approvals' && (
        <div className="panel">
          <h2>Onay Akışı</h2>
          {(state.approvals || []).length === 0 ? <p>Bekleyen onay yok.</p> : (
            <ul>{state.approvals.map((a,i) => <li key={i}>{a.id}: {a.status} - {a.reason}</li>)}</ul>
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <div className="panel">
          <h2>Tazminat Defteri</h2>
          {(state.ledger || []).length === 0 ? <p>Defter boş.</p> : (
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr><th>Tarih</th><th>Tip</th><th>Miktar</th><th>Açıklama</th></tr></thead>
              <tbody>{state.ledger.map((e,i) => <tr key={i}><td>{e.at}</td><td>{e.type}</td><td>{e.amount}</td><td>{e.note}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="panel">
          <h2>Ajan Kayıtları</h2>
          {(state.agent_runs || []).length === 0 ? <p>Kayıt boş. Ajanlar çalıştıkça dolacak.</p> : (
            <ul>{state.agent_runs.slice(-20).map((r,i) => (
              <li key={i}>{r.time || r.at || '-'} · {r.agent || r.market || '-'} · {r.action || r.decision || '-'} · {r.reason || ''}</li>
            ))}</ul>
          )}
        </div>
      )}

      {state.policy_status && (
        <div className="policy">
          <h3>Politika Durumu</h3>
          {Object.entries(state.policy_status).map(([k, v]) => (
            <p key={k}><strong>{k}:</strong> {v.allowed ? 'izinli' : 'yasak'} — {v.reason || ''}</p>
          ))}
        </div>
      )}
    </div>
  );
}
