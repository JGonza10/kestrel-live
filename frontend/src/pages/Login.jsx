import { useState } from 'react'
import { api } from '../api.js'
import Logo from '../components/Logo.jsx'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const d = await api('/auth/login', { method: 'POST', body: { username, password } })
      onLogin(d.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <form className="card login" onSubmit={submit}>
        <div className="brand dark">
          <Logo size={32} />
          <span className="display">Kestrel Live</span>
        </div>
        <label htmlFor="u">Usuario</label>
        <input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={50} />
        <label htmlFor="p">Contraseña</label>
        <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}
