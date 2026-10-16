import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { formatClock } from '../studio/layouts.js'
import { formatBytes, formatDate } from '../lib/format.js'
import RecordingAi from './RecordingAi.jsx'

// Una transmisión terminada: video, descarga y (abajo) lo que genera Kestrel IA.
export default function Recording() {
  const { id } = useParams()
  const [item, setItem] = useState(null)
  const [file, setFile] = useState('')
  const [error, setError] = useState('')
  const playerRef = useRef(null)

  const load = () =>
    api(`/recordings/${id}`)
      .then((d) => {
        setItem(d.item)
        setFile((f) => (d.item.files.some((x) => x.name === f) ? f : d.item.files.at(-1)?.name || ''))
      })
      .catch((e) => setError(e.message))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const remove = async () => {
    if (!window.confirm('¿Borrar este video de tu laptop? No se puede deshacer.')) return
    try {
      await api(`/recordings/${id}/files/${encodeURIComponent(file)}`, { method: 'DELETE' })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!item) {
    return error ? <p className="error" role="alert">{error}</p> : <p className="muted">Cargando…</p>
  }

  const src = file ? `/api/recordings/${id}/files/${encodeURIComponent(file)}` : ''
  const current = item.files.find((f) => f.name === file)

  return (
    <>
      <Link to="/biblioteca" className="back-link">← Biblioteca</Link>
      <p className="section-label">{item.status === 'ended' ? 'TRANSMISIÓN FINALIZADA' : 'EN CURSO'}</p>
      <h1 className="display">{item.title}</h1>
      <p className="muted">
        {formatDate(item.started_at || item.created_at)}
        {item.duration != null && ` · ${formatClock(item.duration)}`}
        {` · ${item.kind === 'live' ? 'Transmisión en vivo' : 'Grabación'}`}
      </p>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="rec-video">
        {src ? (
          <>
            <video key={src} ref={playerRef} src={src} controls preload="metadata" className="player" />
            {item.files.length > 1 && (
              <div className="stack">
                <label htmlFor="rec-file">Parte</label>
                <select id="rec-file" value={file} onChange={(e) => setFile(e.target.value)}>
                  {item.files.map((f, i) => <option key={f.name} value={f.name}>Parte {i + 1} · {formatBytes(f.size)}</option>)}
                </select>
              </div>
            )}
            <div className="actions">
              <a className="btn primary" href={src} download={file}>Descargar grabación{current ? ` (${formatBytes(current.size)})` : ''}</a>
              <button className="btn danger" onClick={remove}>Borrar video</button>
            </div>
          </>
        ) : (
          <p className="card muted">
            No hay video de esta transmisión. Las grabaciones se guardan en la carpeta <code>recordings/</code> del proyecto.
          </p>
        )}
      </section>

      <RecordingAi
        id={id}
        hasVideo={Boolean(src)}
        onSeek={(t) => {
          const v = playerRef.current
          if (!v) return
          v.currentTime = t
          v.play().catch(() => {})
          v.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
      />
    </>
  )
}
