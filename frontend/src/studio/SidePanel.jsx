import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useChat } from '@livekit/components-react'
import { BANNER_MAX, cleanBanner } from './layouts.js'

export const THEMES = [
  ['bubble', 'Burbuja'],
  ['classic', 'Clásico'],
  ['minimal', 'Mínimo'],
  ['block', 'Bloque']
]

export const SWATCHES = [
  ['#a85a22', 'Naranja Kestrel'],
  ['#1f3a4d', 'Azul marino'],
  ['#3d8361', 'Verde'],
  ['#b42318', 'Rojo']
]

const PLATFORM_ABBR = { youtube: 'YT', facebook: 'FB', linkedin: 'in', instagram: 'IG', tiktok: 'TT', rtmp: 'RT' }
export const abbr = (platform) => PLATFORM_ABBR[platform] || 'RT'

export function Switch({ on, onChange, label, disabled }) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  )
}

function DestinationsTab({ dests, selected, onToggle, running }) {
  return (
    <div className="stack">
      {dests.length === 0 && <p className="muted small">Todavía no conectas destinos.</p>}
      {dests.map((d) => (
        <div className="dest-row" key={d.id}>
          <span className={`badge ${d.platform}`}>{abbr(d.platform)}</span>
          <div className="grow">
            <strong className="small">{d.name}</strong>
            <span className="muted small">{d.enabled ? 'Conectado' : 'Desactivado en Destinos'}</span>
          </div>
          <Switch
            on={selected.includes(d.id)}
            onChange={() => onToggle(d.id)}
            label={`Transmitir a ${d.name}`}
            disabled={running || !d.enabled}
          />
        </div>
      ))}
      {running && <p className="muted small">Para cambiar destinos, termina la transmisión.</p>}
      <Link className="btn dashed" to="/destinos">+ Conectar destino</Link>
    </div>
  )
}

function BannersTab({ banners, active, onAdd, onRemove, onToggle }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const add = (e) => {
    e.preventDefault()
    const clean = cleanBanner(text)
    if (!clean) {
      setError(`Escribe un texto de 1 a ${BANNER_MAX} caracteres.`)
      return
    }
    onAdd(clean)
    setText('')
    setError('')
  }

  return (
    <div className="stack">
      {banners.length === 0 && <p className="muted small">Aún no tienes banners.</p>}
      {banners.map((b) => (
        <div className="banner-row" key={b.id}>
          <button type="button" className="banner-item" aria-pressed={active === b.id} onClick={() => onToggle(b.id)}>
            <span>{b.text}</span>
            <strong className="small">{active === b.id ? 'EN ESCENA' : 'Mostrar'}</strong>
          </button>
          <button type="button" className="icon-btn" aria-label={`Borrar banner: ${b.text}`} onClick={() => onRemove(b.id)}>×</button>
        </div>
      ))}
      <form className="stack" onSubmit={add}>
        <label htmlFor="new-banner">Nuevo banner</label>
        <input id="new-banner" value={text} maxLength={BANNER_MAX} onChange={(e) => setText(e.target.value)} placeholder="Ej. Escríbenos por WhatsApp" />
        {error && <span className="error">{error}</span>}
        <button className="btn" type="submit">Agregar banner</button>
      </form>
      <p className="muted small">Toca un banner para mostrarlo u ocultarlo en la escena.</p>
    </div>
  )
}

function StyleTab({ style, onStyle }) {
  return (
    <div className="stack">
      <span className="label">Tema de nombres y banners</span>
      <div className="theme-grid">
        {THEMES.map(([id, label]) => (
          <button type="button" key={id} className="theme-btn" aria-pressed={style.theme === id} onClick={() => onStyle({ theme: id })}>
            <span className={`name-tag static theme-${id}`} style={{ '--brand': style.color }}>{label}</span>
          </button>
        ))}
      </div>
      <span className="label">Color de marca</span>
      <div className="swatches">
        {SWATCHES.map(([c, name]) => (
          <button
            type="button" key={c} className="swatch" style={{ background: c }}
            aria-label={name} aria-pressed={style.color === c} onClick={() => onStyle({ color: c })}
          />
        ))}
      </div>
      <div className="toggle-row">
        <span>Mostrar nombres</span>
        <Switch on={style.showNames} onChange={(v) => onStyle({ showNames: v })} label="Mostrar nombres" />
      </div>
      <div className="toggle-row">
        <span>Mostrar logo</span>
        <Switch on={style.showLogo} onChange={(v) => onStyle({ showLogo: v })} label="Mostrar logo" />
      </div>
    </div>
  )
}

export function PrivateChat() {
  const { send, chatMessages, isSending } = useChat()
  const [text, setText] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [chatMessages.length])

  const submit = async (e) => {
    e.preventDefault()
    const msg = text.trim().slice(0, 500)
    if (!msg) return
    try {
      await send(msg)
      setText('')
    } catch {
      /* si falla, el texto se queda para reintentar */
    }
  }

  return (
    <div className="stack">
      <p className="muted small">Solo lo ven tú y tus invitados. No sale en la transmisión.</p>
      <div className="chat-list">
        {chatMessages.length === 0 && <p className="muted small">Sin mensajes.</p>}
        {chatMessages.map((m) => (
          <div key={m.id ?? m.timestamp} className={`bubble${m.from?.isLocal ? ' mine' : ''}`}>
            {!m.from?.isLocal && <strong className="small">{m.from?.name || 'Invitado'}: </strong>}
            {m.message}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={submit}>
        <label htmlFor="pchat" className="sr-only">Mensaje</label>
        <input id="pchat" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder="Escribe al backstage…" />
        <button className="btn" type="submit" disabled={isSending}>Enviar</button>
      </form>
    </div>
  )
}

function AiTab({ prompter, onPrompter, showPrompter, onShowPrompter }) {
  const soon = [
    ['Subtítulos en vivo', 'Transcribe lo que se dice y lo muestra en escena.'],
    ['Traducción', 'Subtítulos en otro idioma.'],
    ['Moderación del chat', 'Oculta spam e insultos automáticamente.'],
    ['Pregunta destacada', 'Elige la mejor pregunta del chat.']
  ]
  return (
    <div className="stack">
      <p className="muted small">Asistente Kestrel durante la transmisión.</p>
      {soon.map(([label, desc]) => (
        <div className="toggle-row boxed" key={label}>
          <div className="grow">
            <strong className="small">{label}</strong>
            <span className="muted small">{desc}</span>
          </div>
          <span className="soon">Pronto</span>
        </div>
      ))}
      <label htmlFor="tp">Teleprompter</label>
      <textarea id="tp" rows={5} maxLength={5000} value={prompter} onChange={(e) => onPrompter(e.target.value)} placeholder="Pega tu guion aquí" />
      <div className="toggle-row">
        <span>Mostrar arriba del lienzo (solo tú lo ves)</span>
        <Switch on={showPrompter} onChange={onShowPrompter} label="Mostrar teleprompter" />
      </div>
    </div>
  )
}

function Soon({ text }) {
  return <p className="muted small">{text}</p>
}

export default function SidePanel(props) {
  const { kind } = props
  const tabs = [
    kind !== 'recording' && ['destinos', 'Destinos'],
    ['banners', 'Banners'],
    ['estilo', 'Estilo'],
    ['comentarios', 'Comentarios'],
    ['widgets', 'Widgets'],
    ['chat', 'Chat privado'],
    ['ia', 'Kestrel IA']
  ].filter(Boolean)
  const [tab, setTab] = useState(tabs[0][0])
  const title = tabs.find(([id]) => id === tab)?.[1]

  return (
    <aside className="side-panel" aria-label="Panel lateral">
      <div className="side-tabs" role="tablist" aria-label="Secciones">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="side-body" role="tabpanel">
        <h2 className="display">{title}</h2>
        {tab === 'destinos' && (
          <DestinationsTab dests={props.dests} selected={props.selected} onToggle={props.onToggleDest} running={props.running} />
        )}
        {tab === 'banners' && (
          <BannersTab
            banners={props.banners} active={props.activeBanner}
            onAdd={props.onAddBanner} onRemove={props.onRemoveBanner} onToggle={props.onToggleBanner}
          />
        )}
        {tab === 'estilo' && <StyleTab style={props.style} onStyle={props.onStyle} />}
        {tab === 'comentarios' && <Soon text="Pronto: los comentarios de YouTube y Facebook llegarán aquí y podrás ponerlos en escena." />}
        {tab === 'widgets' && <Soon text="Pronto: encuestas y código QR en escena, y encuestas sugeridas por la IA." />}
        {tab === 'chat' && <PrivateChat />}
        {tab === 'ia' && (
          <AiTab prompter={props.prompter} onPrompter={props.onPrompter} showPrompter={props.showPrompter} onShowPrompter={props.onShowPrompter} />
        )}
      </div>
    </aside>
  )
}
