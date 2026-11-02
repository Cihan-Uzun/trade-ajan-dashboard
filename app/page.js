'use client';
import { useEffect, useState } from 'react';

export default function Page() {
  const [state, setState] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetch('/api/state')
      .then(r => r.json())
      .then(setState)
      .catch(e => setErr(e.message));
  }, []);

  if (err) return <div>Veri hatası: {err}</div>;
  if (!state) return <div>Yükleniyor...</div>;

  const books = state.books || {};
  return (
    <div style={{fontFamily: 'system-ui', padding: 20}}>
      <h1>Trade Ajan Paper Dashboard</h1>
      <p>Status: {state.status || 'unknown'} | Integrity: {state.integrity?.ok ? 'OK' : 'FAIL'}</p>
      <p>Updated: {state.updated_at}</p>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16}}>
        {['binance', 'us', 'bist'].map(k => {
          const b = books[k] || {};
          return (
            <div key={k} style={{border: '1px solid #ccc', padding: 12, borderRadius: 8}}>
              <h2>{k.toUpperCase()}</h2>
              <p>Equity: {b.equity?.toFixed(2) || 'N/A'}</p>
              <p>uPnL: {b.unrealized?.toFixed(2) || '0'}</p>
              <p>Realized: {b.realized?.toFixed(2) || '0'}</p>
              <p>Open: {b.open_count || 0}</p>
            </div>
          );
        })}
      </div>
      {state.policy_status && (
        <div style={{marginTop: 20}}>
          <h3>Policy</h3>
          <pre>{JSON.stringify(state.policy_status, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
