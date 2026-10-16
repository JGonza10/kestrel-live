import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { formatClock } from '../studio/layouts.js'
import { formatBytes, formatDate } from '../lib/format.js'

// Biblioteca: transmisiones y grabaciones terminadas, con su MP4.
export default function Library() {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/recordings').then((d) => setItems(d.items)).catch((e) => setError(e.message))
  }, [])

  return (
    <>
      <h1 className="display">Biblioteca</h1>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="table-wrap">
        {items === null && !error && <p className="muted pad">Cargando…</p>}
        {items?.length === 0 && <p className="muted pad">Aquí aparecerán tus transmisiones cuando termines la primera.</p>}
        {items?.map((b) => {
          const size = b.files.reduce((t, f) => t + f.size, 0)
          return (
            <div className="row" key={b.id}>
              <div className="grow">
                <strong>{b.title}</strong>
                <span className="pill">{b.kind === 'live' ? 'Transmisión' : 'Grabación'}</span>
              </div>
              <span className="muted small">
                {formatDate(b.ended_at || b.created_at)}
                {b.duration != null && ` · ${formatClock(b.duration)}`}
                {b.files.length > 0 ? ` · ${formatBytes(size)}` : ' · sin video'}
              </span>
              <Link className="btn" to={`/biblioteca/${b.id}`}>Ver</Link>
            </div>
          )
        })}
      </div>
    </>
  )
}
