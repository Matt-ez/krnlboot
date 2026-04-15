import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import TeamLogo from '../components/TeamLogo';
import api from '../utils/api';

function formatDate(d) {
  return new Date(d).toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' });
}

export default function TeamDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    api.get(`/teams/${id}`)
      .then(r => setData(r.data))
      .catch(() => setError('Squadra non trovata'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loader"><div className="spinner"/></div>;
  if (error)   return <div className="error-msg">{error}</div>;

  const { squadra, giocatori, partite, statistiche, formaRecente } = data;

  const radarData = [
    { subject: 'Attacco',  value: Math.round((statistiche.gol_fatti / Math.max(statistiche.partite_giocate,1)) / 2 * 100) },
    { subject: 'Difesa',   value: Math.max(0, 100 - Math.round((statistiche.gol_subiti / Math.max(statistiche.partite_giocate,1)) / 2 * 100)) },
    { subject: 'Forma',    value: Math.round((statistiche.vittorie / Math.max(statistiche.partite_giocate,1)) * 100) },
    { subject: 'Stabilità',value: Math.round((statistiche.pareggi  / Math.max(statistiche.partite_giocate,1)) * 100) },
    { subject: 'Gol/P',    value: Math.min(100, Math.round((statistiche.gol_fatti / Math.max(statistiche.partite_giocate,1)) * 33)) },
  ];

  return (
    <div>
      {/* Back */}
      <button className="btn btn-ghost" style={{ marginBottom:'1.25rem' }} onClick={() => navigate('/teams')}>
        ← Torna alle squadre
      </button>

      {/* Header card */}
      <div className="card" style={{ marginBottom:'1.25rem', background: `linear-gradient(135deg, ${squadra.colore}22 0%, var(--bg-card) 60%)`, borderColor: squadra.colore + '44' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'1.25rem' }}>
            <TeamLogo
              logoUrl={squadra.logo_url}
              sigla={squadra.logo_sigla}
              color={squadra.colore}
              alt={`Logo ${squadra.nome}`}
              size={72}
              rounded={12}
            />
            <div>
              <h1 style={{ fontFamily:'Barlow Condensed', fontSize:'2rem', fontWeight:800 }}>{squadra.nome}</h1>
              <div style={{ color:'var(--text-muted)', fontSize:'.88rem', display:'flex', gap:'1.5rem', marginTop:'.25rem' }}>
                {squadra.anno_fondazione && <span>📅 Fondato {squadra.anno_fondazione}</span>}
                <span>🏟️ {squadra.stadio}</span>
                <span>📍 {squadra.citta}</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:'.75rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.5px' }}>Posizione</div>
            <div style={{ fontFamily:'Barlow Condensed', fontSize:'3rem', fontWeight:800, color: squadra.colore, lineHeight:1 }}>
              {/* posizione calcolata dal parent - qui segnaposto */}
              🏆
            </div>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stat-cards" style={{ gridTemplateColumns:'repeat(4,1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Punti</div>
          <div className="stat-value green">{statistiche.punti}</div>
          <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.25rem' }}>su {statistiche.partite_giocate} partite</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Vittorie</div>
          <div className="stat-value" style={{ color:'var(--green-light)' }}>{statistiche.vittorie}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gol Segnati</div>
          <div className="stat-value accent">{statistiche.gol_fatti}</div>
          <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.25rem' }}>
            media {(statistiche.gol_fatti / Math.max(statistiche.partite_giocate,1)).toFixed(1)}/p
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Gol Subiti</div>
          <div className="stat-value" style={{ color:'var(--red)' }}>{statistiche.gol_subiti}</div>
          <div style={{ fontSize:'.75rem', color:'var(--text-muted)', marginTop:'.25rem' }}>
            media {(statistiche.gol_subiti / Math.max(statistiche.partite_giocate,1)).toFixed(1)}/p
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop:'1.25rem' }}>
        {/* Giocatori */}
        <div className="card">
          <div className="section-title">👥 Rosa – Top Giocatori</div>
          <table className="data-table">
            <thead>
              <tr><th>Giocatore</th><th>Ruolo</th><th style={{textAlign:'right'}}>Gol</th><th style={{textAlign:'right'}}>Assist</th></tr>
            </thead>
            <tbody>
              {giocatori.map(g => (
                <tr key={g.id_giocatore}>
                  <td style={{ fontWeight:600 }}>{g.nome} {g.cognome}</td>
                  <td><span style={{ fontSize:'.75rem', background:'var(--bg-card2)', padding:'.2rem .5rem', borderRadius:4, color:'var(--text-muted)' }}>{g.ruolo}</span></td>
                  <td style={{ textAlign:'right', fontWeight:700, color:'var(--green-light)' }}>{g.gol_fatti}</td>
                  <td style={{ textAlign:'right', color:'var(--text-muted)' }}>{g.assist}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Forma recente + Radar */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
          <div className="card">
            <div className="section-title">📊 Forma Recente</div>
            <div style={{ display:'flex', gap:'.4rem', marginBottom:'1rem' }}>
              {formaRecente.map((r, i) => (
                <span key={i} className={`result-badge ${r}`} style={{ width:32, height:32, fontSize:'.88rem' }}>{r}</span>
              ))}
            </div>
            <div style={{ display:'flex', gap:'2rem' }}>
              <div>
                <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>Partite Vinte</div>
                <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.6rem', fontWeight:800, color:'var(--green-light)' }}>{statistiche.vittorie}</div>
              </div>
              <div>
                <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>Pareggi</div>
                <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.6rem', fontWeight:800, color:'var(--accent)' }}>{statistiche.pareggi}</div>
              </div>
              <div>
                <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>Sconfitte</div>
                <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.6rem', fontWeight:800, color:'var(--red)' }}>{statistiche.sconfitte}</div>
              </div>
            </div>
          </div>

          {/* Radar chart */}
          <div className="card">
            <div className="section-title">📈 Performance Index</div>
            <ResponsiveContainer width="100%" height={180}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill:'var(--text-muted)', fontSize:11 }} />
                <Radar dataKey="value" stroke={squadra.colore} fill={squadra.colore} fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ultime partite */}
      <div className="card" style={{ marginTop:'1.25rem' }}>
        <div className="section-title">📅 Ultime 10 Partite</div>
        <div style={{ display:'flex', flexDirection:'column', gap:'.4rem' }}>
          {partite.map(p => {
            const isCasa = p.id_squadra_casa === parseInt(id);
            const gF = isCasa ? p.gol_casa : p.gol_trasferta;
            const gS = isCasa ? p.gol_trasferta : p.gol_casa;
            const ris = gF > gS ? 'V' : gF === gS ? 'P' : 'S';
            return (
              <div key={p.id_partita} style={{
                display:'grid', gridTemplateColumns:'auto 1fr auto 1fr auto',
                alignItems:'center', gap:'1rem',
                padding:'.6rem 1rem',
                background:'var(--bg-card2)',
                borderRadius:8,
                border:'1px solid var(--border)'
              }}>
                <span className={`result-badge ${ris}`}>{ris}</span>
                <div style={{ display:'flex', alignItems:'center', gap:'.5rem', fontSize:'.88rem' }}>
                  <TeamLogo
                    logoUrl={p.logo_casa_url}
                    sigla={p.logo_casa}
                    color={p.colore_casa}
                    alt={`Logo ${p.nome_casa}`}
                    size={28}
                    rounded={8}
                  />
                  <span style={{ fontWeight: isCasa ? 700 : 400 }}>{p.nome_casa}</span>
                </div>
                <div style={{ fontFamily:'Barlow Condensed', fontSize:'1.2rem', fontWeight:800, textAlign:'center', minWidth:60 }}>
                  {p.gol_casa} – {p.gol_trasferta}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:'.5rem', justifyContent:'flex-end', fontSize:'.88rem' }}>
                  <span style={{ fontWeight: !isCasa ? 700 : 400 }}>{p.nome_trasferta}</span>
                  <TeamLogo
                    logoUrl={p.logo_trasferta_url}
                    sigla={p.logo_trasferta}
                    color={p.colore_trasferta}
                    alt={`Logo ${p.nome_trasferta}`}
                    size={28}
                    rounded={8}
                  />
                </div>
                <span style={{ fontSize:'.75rem', color:'var(--text-muted)', minWidth:70, textAlign:'right' }}>{formatDate(p.data_ora)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
