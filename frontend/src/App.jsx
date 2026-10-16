import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { api } from './api.js'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Destinations from './pages/Destinations.jsx'
import Studio from './pages/Studio.jsx'
import Guest from './pages/Guest.jsx'
import Output from './pages/Output.jsx'
import Library from './pages/Library.jsx'
import Recording from './pages/Recording.jsx'
import Layout from './components/Layout.jsx'

export default function App() {
  // Los invitados entran con su link, sin cuenta ni login.
  // /salida la abre LiveKit Egress con su propio token para componer la transmisión.
  const { pathname } = useLocation()
  if (pathname === '/salida') return <Output />
  if (pathname.startsWith('/invitado/')) {
    return (
      <Routes>
        <Route path="/invitado/:code" element={<Guest />} />
      </Routes>
    )
  }
  return <HostApp />
}

function HostApp() {
  const [user, setUser] = useState(undefined) // undefined = cargando

  useEffect(() => {
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
  }, [])

  if (user === undefined) return <div className="center muted">Cargando…</div>
  if (!user) return <Login onLogin={setUser} />

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }

  return (
    <Routes>
      <Route path="/studio/:id" element={<Studio user={user} />} />
      <Route element={<Layout user={user} onLogout={logout} />}>
        <Route path="/" element={<Home />} />
        <Route path="/destinos" element={<Destinations />} />
        <Route path="/biblioteca" element={<Library />} />
        <Route path="/biblioteca/:id" element={<Recording />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
