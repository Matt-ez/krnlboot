import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const navItems = [
  { path: '/dashboard',    label: 'Home',             icon: '🏠' },
  { path: '/teams',        label: 'Squadre',          icon: '⚽' },
  { path: '/matches',      label: 'Partite',          icon: '📅' },
  { path: '/predictions',  label: 'Analisi Predittiva', icon: '📈' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user ? (user.nome[0] + user.cognome[0]).toUpperCase() : '?';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">⚽</div>
        <span className="logo-text">CalcioStats</span>
      </div>

      <nav>
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-badge">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user?.nome} {user?.cognome}</div>
            <div className="user-role">{user?.ruolo}</div>
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Logout">⏻</button>
        </div>
      </div>
    </aside>
  );
}
