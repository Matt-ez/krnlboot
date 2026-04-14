import { useState, useEffect } from 'react';
import api from '../utils/api';

function formatDateTime(d) {
  return new Date(d).toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short' });
}
function formatTime(d) {
  return new Date(d).toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });
}

function MatchCard({ p, showScore = true }) {
  const isLive = p.stato === 'in_corso';
  return (
    <div style={{
      display:'grid', gridTemplateColumns:'1fr auto 1fr',
      alignItems:'center', gap:'1rem',
      padding:'1rem 1.5rem',
      background:'var(--bg-card2)',
      borderRadius:10,
      border:`1px solid ${isLive ? 'rgba(229,62,62,.3)' : 'var(--border)'}`,
      marginBottom:'.6rem',
      transition:'border-color .2s'
    }}>
      {/* Casa */}
      <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
        <span className="team-badge" style={{ background: p.colore_casa+'33', color: p.colore_casa, fontSize:'.65rem', width:40, height:40 }}>{p.logo_casa}</span>
        <span style={{ fontWeight:600, fontSize:'1rem' }}>{p.nome_casa}</span>
      </div>

      {/* Centro */}
      <div style={{ textAlign:'center', minWidth:100 }}>
        {isLive && <div className="live-dot" style={{ justifyContent:'center', marginBottom:'.3rem' }}>Live</div>}
        {showScore && p.gol_casa !== null
          ? <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.8rem', fontWeight:800 }}>{p.gol_casa} – {p.gol_trasferta}</div>
          : (
            <div>
              <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.4rem', fontWeight:700 }}>{formatTime(p.data_ora)}</div>
              <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>{formatDateTime(p.data_ora)}</div>
            </div>
          )
        }
        {showScore && <div style={{ fontSize:'.72rem', color:'var(--text-muted)', marginTop:'.2rem' }}>{formatDateTime(p.data_ora)}</div>}
      </div>

      {/* Trasferta */}
      <div style={{ display:'flex', alignItems:'center', gap:'.75rem', justifyContent:'flex-end' }}>
        <span style={{ fontWeight:600, fontSize:'1rem' }}>{p.nome_trasferta}</span>
        <span className="team-badge" style={{ background: p.colore_trasferta+'33', color: p.colore_trasferta, fontSize:'.65rem', width:40, height:40 }}>{p.logo_trasferta}</span>
      </div>
    </div>
  );
}

export default function Matches() {
  const [data, setData]     = useState({ inCorso:[], future:[], terminate:[] });
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [tab, setTab]       = useState('live');

  useEffect(() => {
    api.get('/matches')
      .then(r => setData(r.data))
      .catch(() => setError('Errore caricamento partite'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader"><div className="spinner"/></div>;
  if (error)   return <div className="error-msg">{error}</div>;

  const tabs = [
    { key:'live',      label:`In Diretta (${data.inCorso.length})` },
    { key:'future',    label:`Prossime (${data.future.length})` },
    { key:'terminate', label:`Risultati (${data.terminate.length})` },
  ];

  return (
    <div>
      <h1 className="page-title">Partite</h1>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${tab===t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'live' && (
        <div>
          {data.inCorso.length === 0
            ? <div className="card" style={{ textAlign:'center', color:'var(--text-muted)', padding:'3rem' }}>Nessuna partita in corso al momento</div>
            : data.inCorso.map(p => <MatchCard key={p.id_partita} p={p} showScore={true} />)
          }
        </div>
      )}

      {tab === 'future' && (
        <div>
          {data.future.length === 0
            ? <div className="card" style={{ textAlign:'center', color:'var(--text-muted)', padding:'3rem' }}>Nessuna partita programmata</div>
            : data.future.map(p => <MatchCard key={p.id_partita} p={p} showScore={false} />)
          }
        </div>
      )}

      {tab === 'terminate' && (
        <div>
          {data.terminate.map(p => <MatchCard key={p.id_partita} p={p} showScore={true} />)}
        </div>
      )}
    </div>
  );
}
