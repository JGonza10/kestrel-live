import { useEffect, useState } from 'react'
import { api } from '../api.js'

const PLATFORMS = [
  ['youtube', 'YouTube'],
  ['facebook', 'Facebook'],
  ['linkedin', 'LinkedIn'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['rtmp', 'Otra (RTMP)']
]

const EMPTY = { name: '', platform: 'youtube', rtmp_url: '', stream_key: '' }

export default function Destinations() {
  const [items, setItems] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [fields, setFields] = useState({})

  const load = () => api('/destinations').then((d) => setItems(d.items)).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setFields({})
    try {
      await api('/destinations', { method: 'POST', body: form })
      setForm(EMPTY)
      load()
    } catch (err) {
      setError(err.message)
      setFields(err.fields || {})
    }
  }

  const remove = async (id) => {
    if (!window.confirm('¿Eliminar este destino?')) return
    await api(`/destinations/${id}`, { method: 'DELETE' }).catch((e) => setError(e.message))
    load()
  }

  return (
    <>
      <h1 className="display">Destinos</h1>
      <div className="table-wrap">
        {items.length === 0 && <p className="muted pad">Aún no conectas ningún destino.</p>}
        {items.map((d) => (
          <div className="row" key={d.id}>
            <span className={`badge ${d.platform}`}>{d.platform.slice(0, 2).toUpperCase()}</span>
            <div className="grow">
              <strong>{d.name}</strong>
              <span className="muted small">{d.rtmp_url}</span>
            </div>
            <button className="btn" onClick={() => remove(d.id)}>Eliminar</button>
          </div>
        ))}
      </div>

      <form className="card form" onSubmit={submit}>
        <h2>Agregar destino</h2>
        <label htmlFor="dn">Nombre</label>
        <input id="dn" value={form.name} onChange={set('name')} maxLength={80} required />
        {fields.name && <span className="error">{fields.name}</span>}
        <label htmlFor="dp">Plataforma</label>
        <select id="dp" value={form.platform} onChange={set('platform')}>
          {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label htmlFor="du">URL del servidor RTMP (opcional para YouTube y Facebook)</label>
        <input id="du" value={form.rtmp_url} onChange={set('rtmp_url')} placeholder="rtmp://…" />
        {fields.rtmp_url && <span className="error">{fields.rtmp_url}</span>}
        <label htmlFor="dk">Clave de transmisión</label>
        <input id="dk" type="password" autoComplete="off" value={form.stream_key} onChange={set('stream_key')} required />
        {fields.stream_key && <span className="error">{fields.stream_key}</span>}
        <p className="muted small">La clave se guarda cifrada y nunca se vuelve a mostrar.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary">Guardar destino</button>
      </form>
    </>
  )
}
