import { useEffect, useState } from 'react';
import TeamLogo from '../components/TeamLogo';
import api from '../utils/api';

function formatDate(dateValue) {
  return new Date(dateValue).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
  });
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard')
      .then((response) => setData(response.data))
      .catch(() => setError('Errore caricamento dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loader"><div className="spinner" /></div>;
  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-label">Partite Oggi</div>
          <div className="stat-value green">{data.partiteRecenti?.filter((match) => match.stato === 'in_corso').length || 0}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>in diretta ora</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Squadre Seguite</div>
          <div className="stat-value">{data.totSquadre}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>nel campionato</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Previsioni Corrette</div>
          <div className="stat-value accent">{data.predizioni_corrette}%</div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '.3rem' }}>su {data.totPartite} partite analizzate</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Top Marcatori</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Giocatore</th>
                <th>Squadra</th>
                <th style={{ textAlign: 'right' }}>Gol</th>
                <th style={{ textAlign: 'right' }}>Assist</th>
              </tr>
            </thead>
            <tbody>
              {data.topMarcatori?.map((player, index) => (
                <tr key={player.id_giocatore}>
                  <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{index + 1}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{player.nome} {player.cognome}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{player.ruolo}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem' }}>
                      <TeamLogo
                        logoUrl={player.logo_url}
                        sigla={player.logo_sigla}
                        color={player.colore}
                        alt={`Logo ${player.nome_squadra}`}
                      />
                      <span style={{ fontSize: '.83rem' }}>{player.nome_squadra}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'Barlow Condensed', fontSize: '1.2rem', fontWeight: 700, color: 'var(--green-light)' }}>{player.gol_fatti}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '.9rem' }}>{player.assist}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="section-title">Ultime Partite</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {data.partiteRecenti?.map((match) => {
              const isLive = match.stato === 'in_corso';

              return (
                <div
                  key={match.id_partita}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto 1fr',
                    alignItems: 'center',
                    gap: '.75rem',
                    padding: '.7rem 1rem',
                    background: 'var(--bg-card2)',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.88rem', fontWeight: 600 }}>
                    <TeamLogo
                      logoUrl={match.logo_casa_url}
                      sigla={match.logo_casa}
                      color={match.colore_casa}
                      alt={`Logo ${match.nome_casa}`}
                      size={28}
                    />
                    {match.nome_casa}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {isLive && <div className="live-dot" style={{ marginBottom: '.3rem', justifyContent: 'center' }}>Live</div>}
                    <div style={{ fontFamily: 'Barlow Condensed', fontSize: '1.3rem', fontWeight: 800 }}>
                      {match.gol_casa} - {match.gol_trasferta}
                    </div>
                    {!isLive && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{formatDate(match.data_ora)}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', justifyContent: 'flex-end', fontSize: '.88rem', fontWeight: 600 }}>
                    {match.nome_trasferta}
                    <TeamLogo
                      logoUrl={match.logo_trasferta_url}
                      sigla={match.logo_trasferta}
                      color={match.colore_trasferta}
                      alt={`Logo ${match.nome_trasferta}`}
                      size={28}
                    />
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
