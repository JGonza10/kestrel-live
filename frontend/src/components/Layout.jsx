import { NavLink, Outlet } from 'react-router-dom'
import Logo from './Logo.jsx'

export default function Layout({ user, onLogout }) {
  return (
    <div className="shell">
      <nav className="sidenav" aria-label="Navegación principal">
        <div className="brand">
          <Logo size={28} />
          <span className="display">Kestrel Live</span>
        </div>
        <NavLink to="/" end>Inicio</NavLink>
        <NavLink to="/biblioteca">Biblioteca</NavLink>
        <NavLink to="/destinos">Destinos</NavLink>
        <div className="sidenav-foot">
          <span>{user.display_name}</span>
          <button className="btn ghost-light" onClick={onLogout}>Salir</button>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
