import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'

export default function Home() {
  const [tab, setTab] = useState('active')
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api(`/broadcasts?status=${tab}`).then((d) => setItems(d.items)).catch((e) => setError(e.message))
  }, [tab])

  const create = async (kind) => {
    const title = window.prompt(kind === 'live' ? 'Título de la transmisión' : 'Título de la grabación')
    if (!title) return
    try {
      const d = await api('/broadcasts', { method: 'POST', body: { title, kind } })
      navigate(`/studio/${d.item.id}`)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <h1 className="display">Inicio</h1>
      <section>
        <h2>Crear</h2>
        <div className="grid-cards">
          <button className="card create" onClick={() => create('live')}>
            <strong>Transmisión en vivo</strong>
            <span className="muted">Sal en vivo en varias redes a la vez</span>
          </button>
          <button className="card create" onClick={() => create('recording')}>
            <strong>Grabación</strong>
            <span className="muted">Graba sin transmitir en vivo</span>
          </button>
        </div>
      </section>
      <section>
        <h2>Estudios</h2>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>Activos</button>
          <button role="tab" aria-selected={tab === 'ended'} onClick={() => setTab('ended')}>Usados</button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="table-wrap">
          {items.length === 0 && <p className="muted pad">No tienes estudios aquí todavía.</p>}
          {items.map((b) => (
            <div className="row" key={b.id}>
              <div className="grow">
                <strong>{b.title}</strong>
                <span className="pill">{b.kind === 'live' ? 'Transmisión' : 'Grabación'} · {b.status}</span>
              </div>
              <span className="muted">{new Date(b.created_at).toLocaleString('es-MX')}</span>
              {b.status !== 'ended'
                ? <Link className="btn primary" to={`/studio/${b.id}`}>Entrar al estudio</Link>
                : <Link className="btn" to={`/biblioteca/${b.id}`}>Ver resumen</Link>}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
