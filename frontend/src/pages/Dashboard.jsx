import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

function formatDate(d) {
  return new Date(d).toLocaleDateString('it-IT', { day:'2-digit', month:'short' });
}

function formatDateTime(d) {
  return new Date(d).toLocaleString('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard')
      .then(r => setData(r.data))
      .catch(() => setError('Errore caricamento dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader"><div className="spinner"/></div>;
  if (error)   return <div className="error-msg">{error}</div>;

  const today = new Date().toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  return (
    <div>
      {/* Topbar */}
      <div className="topbar">
        <div className="search-box">
          <span style={{ color:'var(--text-muted)' }}>🔍</span>
          <input placeholder="Cerca squadre, giocatori, partite..." />
        </div>
        <span style={{ color:'var(--text-muted)', fontSize:'.85rem', textTransform:'capitalize' }}>{today}</span>
      </div>

      <h1 className="page-title">Dashboard</h1>

      {data.ultimaSync && (
        <div className="card" style={{ marginBottom:'1rem', padding:'1rem 1.25rem' }}>
          <div style={{ fontSize:'.8rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.4px' }}>
            Ultimo import
          </div>
          <div style={{ marginTop:'.3rem', fontWeight:600 }}>
            {data.ultimaSync.sorgente} - {formatDateTime(data.ultimaSync.created_at)}
          </div>
          <div style={{ marginTop:'.2rem', fontSize:'.85rem', color:'var(--text-muted)' }}>
            {data.ultimaSync.squadre_importate} squadre, {data.ultimaSync.partite_importate} partite, {data.ultimaSync.giocatori_importati} giocatori
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-label">Partite Oggi</div>
          <div className="stat-value green">{data.partiteRecenti?.filter(p => p.stato === 'in_corso').length || 0}</div>
          <div style={{ fontSize:'.78rem', color:'var(--text-muted)', marginTop:'.3rem' }}>in diretta ora</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Squadre Seguite</div>
          <div className="stat-value">{data.totSquadre}</div>
          <div style={{ fontSize:'.78rem', color:'var(--text-muted)', marginTop:'.3rem' }}>nel campionato</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Previsioni Corrette</div>
          <div className="stat-value accent">{data.predizioni_corrette}%</div>
          <div style={{ fontSize:'.78rem', color:'var(--text-muted)', marginTop:'.3rem' }}>su {data.totPartite} partite analizzate</div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid-2">
        {/* Top marcatori */}
        <div className="card">
          <div className="section-title">🥅 Top Marcatori</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Giocatore</th>
                <th>Squadra</th>
                <th style={{ textAlign:'right' }}>Gol</th>
                <th style={{ textAlign:'right' }}>Assist</th>
              </tr>
            </thead>
            <tbody>
              {data.topMarcatori?.map((g, i) => (
                <tr key={g.id_giocatore}>
                  <td style={{ color:'var(--text-muted)', fontWeight:600 }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight:600 }}>{g.nome} {g.cognome}</div>
                    <div style={{ fontSize:'.75rem', color:'var(--text-muted)', textTransform:'capitalize' }}>{g.ruolo}</div>
                  </td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:'.4rem' }}>
                      <span className="team-badge" style={{ background: g.colore + '33', color: g.colore, fontSize:'.65rem' }}>{g.logo_sigla}</span>
                      <span style={{ fontSize:'.83rem' }}>{g.nome_squadra}</span>
                    </div>
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'Barlow Condensed', fontSize:'1.2rem', fontWeight:700, color:'var(--green-light)' }}>{g.gol_fatti}</td>
                  <td style={{ textAlign:'right', color:'var(--text-muted)', fontSize:'.9rem' }}>{g.assist}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ultime partite */}
        <div className="card">
          <div className="section-title">📋 Ultime Partite</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'.5rem' }}>
            {data.partiteRecenti?.map(p => {
              const isLive = p.stato === 'in_corso';
              return (
                <div key={p.id_partita} style={{
                  display:'grid', gridTemplateColumns:'1fr auto 1fr',
                  alignItems:'center', gap:'.75rem',
                  padding:'.7rem 1rem',
                  background:'var(--bg-card2)',
                  borderRadius:8,
                  border:'1px solid var(--border)'
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'.5rem', fontSize:'.88rem', fontWeight:600 }}>
                    <span className="team-badge" style={{ background: p.colore_casa+'33', color: p.colore_casa, fontSize:'.6rem' }}>{p.logo_casa}</span>
                    {p.nome_casa}
                  </div>
                  <div style={{ textAlign:'center' }}>
                    {isLive && <div className="live-dot" style={{ marginBottom:'.3rem', justifyContent:'center' }}>Live</div>}
                    <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.3rem', fontWeight:800 }}>
                      {p.gol_casa} – {p.gol_trasferta}
                    </div>
                    {!isLive && <div style={{ fontSize:'.7rem', color:'var(--text-muted)' }}>{formatDate(p.data_ora)}</div>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:'.5rem', justifyContent:'flex-end', fontSize:'.88rem', fontWeight:600 }}>
                    {p.nome_trasferta}
                    <span className="team-badge" style={{ background: p.colore_trasferta+'33', color: p.colore_trasferta, fontSize:'.6rem' }}>{p.logo_trasferta}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
