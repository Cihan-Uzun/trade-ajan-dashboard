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

  if (err) return <div style={{padding:20}}>Veri hatası: {err}</div>;
  if (!state) return <div style={{padding:20}}>Yükleniyor...</div>;

  const books = state.books || {};
  const tabs = [
    {id: 'genel', label: 'Genel'},
    {id: 'binance', label: 'Binance'},
    {id: 'us', label: 'ABD'},
    {id: 'bist', label: 'BIST'},
    {id: 'tavan', label: 'Tavan'},
    {id: 'approvals', label: 'Onaylar'},
    {id: 'ledger', label: 'Ledger'},
    {id: 'logs', label: 'Agent Logs'}
  ];

  const renderBook = (key) => {
    const b = books[key] || {};
    return (
      <div>
        <h2>{key.toUpperCase()} Kitap</h2>
        <p>Start: {b.start} | Equity: {b.equity?.toFixed(2)} | Cash: {b.cash?.toFixed(2)}</p>
        <p>uPnL: {b.unrealized?.toFixed(2) || 0} | Realized: {b.realized?.toFixed(2) || 0} | Open: {b.open_count || 0}</p>
        {key === 'tavan' && b.watch && <p>Watch: {b.watch.join(', ') || 'boş'}</p>}
        {key === 'tavan' && b.last_decision && <p>Son karar: {JSON.stringify(b.last_decision)}</p>}
        <h3>Pozisyonlar</h3>
        <ul>{(b.positions || []).map((p,i) => <li key={i}>{p.symbol} qty:{p.qty_left} entry:{p.entry}</li>)}</ul>
        <h3>Son işlemler</h3>
        <ul>{(b.trades || []).slice(-5).map((t,i) => <li key={i}>{t.symbol} {t.side} pnl:{t.pnl}</li>)}</ul>
      </div>
    );
  };

  return (
    <div style={{fontFamily: 'system-ui', padding: 20, maxWidth: 1200, margin: '0 auto'}}>
      <h1>Trade Ajan Paper Dashboard v0.4</h1>
      <p>Tenant: {state.tenant || 'default'} | Status: {state.status} | Integrity: {state.integrity?.ok ? 'OK' : 'FAIL'} | Updated: {state.updated_at}</p>
      <div style={{display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap'}}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', border: '1px solid #ccc', borderRadius: 6,
            background: tab === t.id ? '#0070f3' : '#fff', color: tab === t.id ? '#fff' : '#000',
            cursor: 'pointer'
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'genel' && (
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16}}>
          {['binance', 'us', 'bist', 'tavan'].map(k => {
            const b = books[k] || {};
            return (
              <div key={k} style={{border: '1px solid #ddd', padding: 12, borderRadius: 8}}>
                <h3>{k.toUpperCase()}</h3>
                <p>Equity: {b.equity?.toFixed(2) || 'N/A'}</p>
                <p>uPnL: {b.unrealized?.toFixed(2) || 0}</p>
                <p>Realized: {b.realized?.toFixed(2) || 0}</p>
                <p>Open: {b.open_count || 0}</p>
              </div>
            );
          })}
        </div>
      )}

      {['binance', 'us', 'bist', 'tavan'].includes(tab) && renderBook(tab)}

      {tab === 'approvals' && (
        <div>
          <h2>Onay Akışı (Approval Workflow)</h2>
          <p>Paper trade önerileri ve manuel onaylar. Tam workflow: propose → pending → approved/rejected → execute.</p>
          {(state.approvals || []).length === 0 ? <p>Bekleyen onay yok.</p> : (
            <ul>{state.approvals.map((a,i) => <li key={i}>{a.id}: {a.status} - {a.reason}</li>)}</ul>
          )}
        </div>
      )}

      {tab === 'ledger' && (
        <div>
          <h2>Compensation Ledger</h2>
          <p>Komisyon, slippage, adjustment, realized PnL double-entry tarzı kayıtlar. Tenant sınırlı.</p>
          {(state.ledger || []).length === 0 ? <p>Ledger boş.</p> : (
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead><tr><th>Tarih</th><th>Tip</th><th>Miktar</th><th>Açıklama</th></tr></thead>
              <tbody>{state.ledger.map((e,i) => <tr key={i}><td>{e.at}</td><td>{e.type}</td><td>{e.amount}</td><td>{e.note}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div>
          <h2>Agent Runs Log (zengin)</h2>
          <p>Her tick/karar: agent, market, action, confidence, policy checks, timestamp.</p>
          {(state.agent_runs || []).length === 0 ? <p>Log boş. Ajanlar çalıştıkça dolacak.</p> : (
            <ul>{state.agent_runs.slice(-20).map((r,i) => <li key={i}><pre>{JSON.stringify(r, null, 2)}</pre></li>)}</ul>
          )}
        </div>
      )}

      {state.policy_status && (
        <div style={{marginTop: 24, padding: 12, background: '#f5f5f5', borderRadius: 8}}>
          <h3>Policy Status</h3>
          <pre>{JSON.stringify(state.policy_status, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
