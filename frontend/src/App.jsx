import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { api } from './api.js'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Destinations from './pages/Destinations.jsx'
import Studio from './pages/Studio.jsx'
import Layout from './components/Layout.jsx'

export default function App() {
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
