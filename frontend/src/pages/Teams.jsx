import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

export default function Teams() {
  const [squadre, setSquadre] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [search, setSearch]   = useState('');
  const [tab, setTab]         = useState('Tutte');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/teams')
      .then(r => setSquadre(r.data))
      .catch(() => setError('Errore caricamento squadre'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = squadre.filter(s =>
    s.nome.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loader"><div className="spinner"/></div>;
  if (error)   return <div className="error-msg">{error}</div>;

  return (
    <div>
    
      <h1 className="page-title">Squadre</h1>

      <div className="tabs">
        {['Tutte','Serie A','Serie B'].map(t => (
          <button key={t} className={`tab ${tab===t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              <th>POS</th>
              <th>Squadra</th>
              <th style={{ textAlign:'center' }}>Punti</th>
              <th style={{ textAlign:'center' }}>Giocate</th>
              <th style={{ textAlign:'center' }}>V</th>
              <th style={{ textAlign:'center' }}>P</th>
              <th style={{ textAlign:'center' }}>S</th>
              <th style={{ textAlign:'center' }}>GF</th>
              <th style={{ textAlign:'center' }}>GS</th>
              <th style={{ textAlign:'center' }}>DR</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => (
              <tr
                key={s.id_squadra}
                style={{ cursor:'pointer' }}
                onClick={() => navigate(`/teams/${s.id_squadra}`)}
              >
                <td>
                  <span style={{
                    fontWeight: 700,
                    color: i < 4 ? 'var(--green-light)' : i === 4 ? 'var(--accent)' : 'var(--text-muted)'
                  }}>{i + 1}</span>
                </td>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:'.75rem' }}>
                    <span className="team-badge" style={{
                      background: s.colore + '33',
                      color: s.colore,
                      fontSize:'.65rem',
                      width:36, height:36
                    }}>{s.logo_sigla}</span>
                    <div>
                      <div style={{ fontWeight:600 }}>{s.nome}</div>
                      <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>{s.citta}</div>
                    </div>
                  </div>
                </td>
                <td style={{ textAlign:'center', fontFamily:'Barlow Condensed', fontSize:'1.2rem', fontWeight:800, color:'var(--text)' }}>{s.punti}</td>
                <td style={{ textAlign:'center', color:'var(--text-muted)' }}>{s.partite_giocate}</td>
                <td style={{ textAlign:'center', color:'var(--green-light)', fontWeight:600 }}>{s.vittorie}</td>
                <td style={{ textAlign:'center', color:'var(--accent)', fontWeight:600 }}>{s.pareggi}</td>
                <td style={{ textAlign:'center', color:'var(--red)', fontWeight:600 }}>{s.sconfitte}</td>
                <td style={{ textAlign:'center' }}>{s.gol_fatti}</td>
                <td style={{ textAlign:'center' }}>{s.gol_subiti}</td>
                <td style={{ textAlign:'center', color: (s.gol_fatti - s.gol_subiti) >= 0 ? 'var(--green-light)' : 'var(--red)', fontWeight:600 }}>
                  {s.gol_fatti - s.gol_subiti > 0 ? '+' : ''}{s.gol_fatti - s.gol_subiti}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
