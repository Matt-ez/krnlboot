import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [form, setForm] = useState({ nome:'', cognome:'', email:'', password:'', ruolo:'tifoso' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      let res;
      if (mode === 'login') {
        res = await api.post('/login', { email: form.email, password: form.password });
      } else {
        if (!form.nome || !form.cognome) { setError('Nome e cognome obbligatori'); setLoading(false); return; }
        res = await api.post('/register', form);
      }
      login(res.data.user, res.data.token);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Errore di rete. Controllare il server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ width:64, height:64, background:'var(--green)', borderRadius:'50%',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'2rem', margin:'0 auto .75rem' }}>⚽</div>
          <h1 style={{ fontFamily:'Barlow Condensed', fontSize:'1.8rem', fontWeight:800 }}>CalcioStats</h1>
          <p style={{ color:'var(--text-muted)', fontSize:'.88rem', marginTop:'.25rem' }}>Piattaforma Sport Analytics</p>
        </div>

        {/* Toggle */}
        <div className="tabs" style={{ marginBottom:'1.5rem' }}>
          <button className={`tab ${mode==='login' ? 'active' : ''}`} onClick={() => setMode('login')} style={{ flex:1 }}>Accedi</button>
          <button className={`tab ${mode==='register' ? 'active' : ''}`} onClick={() => setMode('register')} style={{ flex:1 }}>Registrati</button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {mode === 'register' && (
          <div className="grid-2" style={{ gap:'.75rem', marginBottom:'0' }}>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input className="form-control" name="nome" value={form.nome} onChange={handleChange} placeholder="Marco" />
            </div>
            <div className="form-group">
              <label className="form-label">Cognome</label>
              <input className="form-control" name="cognome" value={form.cognome} onChange={handleChange} placeholder="Rossi" />
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="form-control" name="email" type="email" value={form.email} onChange={handleChange} placeholder="email@esempio.it" />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="form-control" name="password" type="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
        </div>

        {mode === 'register' && (
          <div className="form-group">
            <label className="form-label">Ruolo</label>
            <select className="form-control" name="ruolo" value={form.ruolo} onChange={handleChange}>
              <option value="tifoso">🏟️ Tifoso</option>
              <option value="allenatore">🎯 Allenatore</option>
              <option value="analista">📊 Analista</option>
            </select>
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width:'100%', justifyContent:'center', padding:'.8rem', fontSize:'1rem', marginTop:'.5rem' }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? '...' : mode === 'login' ? 'Accedi' : 'Registrati'}
        </button>

        {/* Demo hint */}
        <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:'.78rem', marginTop:'1.25rem' }}>
          Demo: qualsiasi email/password nuova crea un account
        </p>
      </div>
    </div>
  );
}
