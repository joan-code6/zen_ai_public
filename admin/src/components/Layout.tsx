import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LayoutDashboard, Cpu, Settings, Users, LogOut, Cog, CreditCard } from 'lucide-react';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="sidebar-title">Zen AI</h2>
          <span className="sidebar-badge">Admin</span>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/dashboard" className={({ isActive }) => 
            `nav-link ${isActive ? 'active' : ''}`
          }>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </NavLink>

          <NavLink to="/users" className={({ isActive }) => 
            `nav-link ${isActive ? 'active' : ''}`
          }>
            <Users size={20} />
            <span>Users</span>
          </NavLink>

          <NavLink to="/models" className={({ isActive }) => 
            `nav-link ${isActive ? 'active' : ''}`
          }>
            <Cpu size={20} />
            <span>Models</span>
          </NavLink>

          <NavLink to="/plans" className={({ isActive }) => 
            `nav-link ${isActive ? 'active' : ''}`
          }>
            <CreditCard size={20} />
            <span>Plans</span>
          </NavLink>

          <NavLink to="/configuration" className={({ isActive }) => 
            `nav-link ${isActive ? 'active' : ''}`
          }>
            <Settings size={20} />
            <span>Configuration</span>
          </NavLink>

          <NavLink to="/settings" className={({ isActive }) => 
            `nav-link ${isActive ? 'active' : ''}`
          }>
            <Cog size={20} />
            <span>Settings</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <p className="user-name">{user?.displayName || 'Admin'}</p>
              <p className="user-email">{user?.email}</p>
            </div>
          </div>
          <button onClick={logout} className="logout-button">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
