import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LiveKitRoom, VideoConference } from '@livekit/components-react'
import '@livekit/components-styles'
import { api } from '../api.js'
import Logo from '../components/Logo.jsx'

const LAYOUTS = [
  ['speaker', 'Líder'],
  ['grid', 'Grupo'],
  ['single-speaker', 'Solo']
]

export default function Studio() {
  const { id } = useParams()
  const [broadcast, setBroadcast] = useState(null)
  const [conn, setConn] = useState(null)
  const [dests, setDests] = useState([])
  const [selected, setSelected] = useState([])
  const [layout, setLayout] = useState('speaker')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api(`/broadcasts/${id}`).then((d) => setBroadcast(d.item)).catch((e) => setError(e.message))
    api(`/broadcasts/${id}/token`, { method: 'POST' }).then(setConn).catch((e) => setError(e.message))
    api('/destinations').then((d) => {
      setDests(d.items)
      setSelected(d.items.filter((x) => x.enabled).map((x) => x.id))
    }).catch(() => {})
  }, [id])

  const toggle = (destId) =>
    setSelected((s) => (s.includes(destId) ? s.filter((x) => x !== destId) : [...s, destId]))

  const running = broadcast && ['live', 'recording'].includes(broadcast.status)

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await api(`/broadcasts/${id}/start`, { method: 'POST', body: { destination_ids: selected, layout } })
      setBroadcast(d.item)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    setBusy(true)
    try {
      const d = await api(`/broadcasts/${id}/stop`, { method: 'POST' })
      setBroadcast(d.item)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="studio">
      <header className="studio-bar">
        <Link to="/" className="brand"><Logo size={26} /><span className="display">Kestrel Live</span></Link>
        <strong className="grow">{broadcast?.title ?? '…'}</strong>
        {running && <span className="live-badge">{broadcast.status === 'live' ? 'EN VIVO' : 'GRABANDO'}</span>}
        {running ? (
          <button className="btn danger" onClick={stop} disabled={busy}>Terminar</button>
        ) : broadcast?.status !== 'ended' ? (
          <button className="btn primary" onClick={start} disabled={busy || !conn}>
            {broadcast?.kind === 'recording' ? 'Grabar' : 'Salir en vivo'}
          </button>
        ) : (
          <span className="muted">Finalizada</span>
        )}
      </header>

      {error && <p className="error pad" role="alert">{error}</p>}

      <div className="studio-body">
        <section className="stage" aria-label="Escena">
          {conn ? (
            <LiveKitRoom token={conn.token} serverUrl={conn.ws_url} connect video audio data-lk-theme="default" style={{ height: '100%' }}>
              <VideoConference />
            </LiveKitRoom>
          ) : (
            <div className="center muted">Conectando al estudio…</div>
          )}
        </section>

        <aside className="panel">
          <h2>Diseño</h2>
          <div className="chips">
            {LAYOUTS.map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={layout === v} onClick={() => setLayout(v)}>{l}</button>
            ))}
          </div>
          {broadcast?.kind !== 'recording' && (
            <>
              <h2>Destinos</h2>
              {dests.length === 0 && <p className="muted small">Agrega destinos en la sección Destinos.</p>}
              {dests.map((d) => (
                <label key={d.id} className="check">
                  <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} disabled={running} />
                  {d.name}
                </label>
              ))}
            </>
          )}
          <h2>Kestrel IA</h2>
          <p className="muted small">Próximamente: subtítulos en vivo, moderación del chat y resumen con clips al terminar.</p>
        </aside>
      </div>
    </div>
  )
}
