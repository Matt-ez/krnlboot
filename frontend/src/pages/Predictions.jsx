import { useState, useEffect } from 'react';
import api from '../utils/api';

function PredBar({ label, value, color }) {
  return (
    <div style={{ flex:1 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'.3rem' }}>
        <span style={{ fontSize:'.8rem', color:'var(--text-muted)' }}>{label}</span>
        <span style={{ fontFamily:'Barlow Condensed', fontSize:'1.1rem', fontWeight:700, color }}>{value}%</span>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width:`${value}%`, background: color }} />
      </div>
    </div>
  );
}

export default function Predictions() {
  const [squadre, setSquadre]   = useState([]);
  const [idCasa, setIdCasa]     = useState('');
  const [idTrasferta, setIdTrasferta] = useState('');
  const [result, setResult]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [stats, setStats]       = useState(null);
  const [error, setError]       = useState('');

  useEffect(() => {
    api.get('/teams').then(r => setSquadre(r.data));
    api.get('/predictions').then(r => setStats(r.data)).catch(() => {});
  }, []);

  const handlePredict = async () => {
    if (!idCasa || !idTrasferta) { setError('Seleziona entrambe le squadre'); return; }
    if (idCasa === idTrasferta)  { setError('Le squadre devono essere diverse'); return; }
    setError(''); setLoading(true); setResult(null);
    try {
      const r = await api.get(`/predictions/${idCasa}/${idTrasferta}`);
      setResult(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Errore nel calcolo');
    } finally {
      setLoading(false);
    }
  };

  const winner = result
    ? result.percentuali.vittoria_casa > result.percentuali.vittoria_trasferta
      ? result.squadra_casa
      : result.squadra_trasferta
    : null;

  return (
    <div>
      <h1 className="page-title">Analisi Predittiva</h1>

      {/* Stats overview */}
      {stats && (
        <div className="stat-cards" style={{ marginBottom:'1.5rem' }}>
          <div className="stat-card" style={{ background:'linear-gradient(135deg,var(--green-dark),var(--bg-card))' }}>
            <div className="stat-label">Accuratezza Totale</div>
            <div className="stat-value green">{stats.accuratezza_totale}%</div>
            <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.25rem' }}>su {stats.partite_analizzate} predizioni</div>
          </div>
          <div className="stat-card" style={{ background:'linear-gradient(135deg,rgba(59,130,246,.15),var(--bg-card))' }}>
            <div className="stat-label">Questa Settimana</div>
            <div className="stat-value" style={{ color:'var(--blue)' }}>{stats.accuratezza_settimana}%</div>
            <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.25rem' }}>8 su 10 corrette</div>
          </div>
          <div className="stat-card" style={{ background:'linear-gradient(135deg,rgba(240,136,62,.15),var(--bg-card))' }}>
            <div className="stat-label">Migliore Categoria</div>
            <div className="stat-value accent" style={{ fontSize:'1.4rem' }}>{stats.migliore_categoria}</div>
            <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.25rem' }}>85% accuratezza</div>
          </div>
        </div>
      )}

      {/* Selector */}
      <div className="card" style={{ marginBottom:'1.5rem' }}>
        <div className="section-title">⚙️ Seleziona la Partita</div>

        {error && <div className="error-msg">{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr auto', gap:'1rem', alignItems:'flex-end' }}>
          <div>
            <label className="form-label">Squadra Casa</label>
            <select className="form-control" value={idCasa} onChange={e => setIdCasa(e.target.value)}>
              <option value="">-- Seleziona --</option>
              {squadre.map(s => (
                <option key={s.id_squadra} value={s.id_squadra}>{s.nome}</option>
              ))}
            </select>
          </div>

          <div style={{ textAlign:'center', paddingBottom:'.5rem' }}>
            <span style={{ fontFamily:'Barlow Condensed', fontSize:'1.5rem', fontWeight:800, color:'var(--text-muted)' }}>VS</span>
          </div>

          <div>
            <label className="form-label">Squadra Trasferta</label>
            <select className="form-control" value={idTrasferta} onChange={e => setIdTrasferta(e.target.value)}>
              <option value="">-- Seleziona --</option>
              {squadre.map(s => (
                <option key={s.id_squadra} value={s.id_squadra}>{s.nome}</option>
              ))}
            </select>
          </div>

          <button className="btn btn-primary" onClick={handlePredict} disabled={loading} style={{ padding:'.65rem 2rem' }}>
            {loading ? '...' : '📊 Analizza'}
          </button>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div className="card">
          {/* Header partita */}
          <div style={{
            display:'grid', gridTemplateColumns:'1fr auto 1fr',
            alignItems:'center', gap:'1.5rem',
            padding:'1.5rem',
            background:'var(--bg-card2)',
            borderRadius:10,
            marginBottom:'1.5rem',
            border:'1px solid var(--border)'
          }}>
            <div style={{ textAlign:'center' }}>
              <div className="team-badge" style={{
                background: result.squadra_casa.colore+'33',
                color: result.squadra_casa.colore,
                width:56, height:56, borderRadius:10, fontSize:'1rem', fontWeight:800,
                display:'flex', alignItems:'center', justifyContent:'center',
                margin:'0 auto .5rem'
              }}>{result.squadra_casa.logo_sigla}</div>
              <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.2rem', fontWeight:800 }}>{result.squadra_casa.nome}</div>
              <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>Casa</div>
            </div>

            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'Barlow Condensed', fontSize:'2rem', fontWeight:800, color:'var(--text-muted)' }}>VS</div>
              <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.25rem' }}>
                Confidenza: <span style={{ color: result.confidenza > 70 ? 'var(--green-light)' : 'var(--accent)' }}>{result.confidenza}%</span>
              </div>
            </div>

            <div style={{ textAlign:'center' }}>
              <div className="team-badge" style={{
                background: result.squadra_trasferta.colore+'33',
                color: result.squadra_trasferta.colore,
                width:56, height:56, borderRadius:10, fontSize:'1rem', fontWeight:800,
                display:'flex', alignItems:'center', justifyContent:'center',
                margin:'0 auto .5rem'
              }}>{result.squadra_trasferta.logo_sigla}</div>
              <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.2rem', fontWeight:800 }}>{result.squadra_trasferta.nome}</div>
              <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>Trasferta</div>
            </div>
          </div>

          {/* Percentuali */}
          <div style={{ display:'flex', gap:'1rem', marginBottom:'1.5rem' }}>
            <PredBar label={`Vittoria ${result.squadra_casa.nome}`}       value={result.percentuali.vittoria_casa}      color="var(--green-light)" />
            <PredBar label="Pareggio"                                      value={result.percentuali.pareggio}           color="var(--accent)" />
            <PredBar label={`Vittoria ${result.squadra_trasferta.nome}`}  value={result.percentuali.vittoria_trasferta} color="var(--blue)" />
          </div>

          {/* Pronostico */}
          <div style={{
            background: winner?.colore + '22',
            border: `1px solid ${winner?.colore}44`,
            borderRadius:10, padding:'1rem 1.5rem',
            display:'flex', alignItems:'center', gap:'.75rem',
            marginBottom:'1.5rem'
          }}>
            <span style={{ fontSize:'1.5rem' }}>🏆</span>
            <div>
              <div style={{ fontSize:'.78rem', color:'var(--text-muted)' }}>Pronostico algoritmo</div>
              <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.4rem', fontWeight:800, color: winner?.colore }}>
                Vittoria {winner?.nome}
              </div>
            </div>
          </div>

          {/* Forma recente */}
          <div className="grid-2">
            <div>
              <div className="section-title" style={{ fontSize:'.8rem' }}>Forma Recente – {result.squadra_casa.nome}</div>
              <div style={{ display:'flex', gap:'.3rem', marginBottom:'.5rem' }}>
                {result.forma_recente.casa.map((r, i) => (
                  <span key={i} className={`result-badge ${r}`}>{r}</span>
                ))}
              </div>
              <div style={{ fontSize:'.8rem', color:'var(--text-muted)' }}>
                Indice attacco: <strong style={{ color:'var(--green-light)' }}>{result.indici.casa.attacco.toFixed(2)}</strong> &nbsp;
                Indice difesa: <strong style={{ color:'var(--blue)' }}>{result.indici.casa.difesa.toFixed(2)}</strong>
              </div>
            </div>
            <div>
              <div className="section-title" style={{ fontSize:'.8rem' }}>Forma Recente – {result.squadra_trasferta.nome}</div>
              <div style={{ display:'flex', gap:'.3rem', marginBottom:'.5rem' }}>
                {result.forma_recente.trasferta.map((r, i) => (
                  <span key={i} className={`result-badge ${r}`}>{r}</span>
                ))}
              </div>
              <div style={{ fontSize:'.8rem', color:'var(--text-muted)' }}>
                Indice attacco: <strong style={{ color:'var(--green-light)' }}>{result.indici.trasferta.attacco.toFixed(2)}</strong> &nbsp;
                Indice difesa: <strong style={{ color:'var(--blue)' }}>{result.indici.trasferta.difesa.toFixed(2)}</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
