import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useDataChannel,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext
} from '@livekit/components-react'
import { DisconnectReason } from 'livekit-client'
import { api } from '../api.js'
import Logo from '../components/Logo.jsx'
import Stage from '../studio/Stage.jsx'
import DeviceSettings from '../studio/DeviceSettings.jsx'
import { PrivateChat } from '../studio/SidePanel.jsx'
import { CAPTION_TOPIC, STAGE_TOPIC, encodeCaption, isHost, parseStage } from '../studio/stageSync.js'
import { useSpeechCaptions } from '../studio/useSpeechCaptions.js'
import { useStageSources } from '../studio/useStageSources.js'
import '../studio/studio.css'

const NAME_KEY = 'kl-guest-name'
const DEFAULT_STYLE = { theme: 'bubble', color: '#a85a22', showNames: true, showLogo: true }

function savedName() {
  try {
    return window.localStorage.getItem(NAME_KEY) || ''
  } catch {
    return ''
  }
}

function GuestBar({ title, inRoom = false, children }) {
  return (
    <header className="studio-bar">
      <span className="brand"><Logo size={26} /><span className="display hide-sm">Kestrel Live</span></span>
      <span className="bar-sep hide-sm" />
      <div className="grow">
        <strong className="ellipsis">{title || 'Estudio'}</strong>
        <span className="bar-sub">{inRoom ? 'Estás como invitado' : 'Invitación al estudio'}</span>
      </div>
      {children}
    </header>
  )
}

// Página pública: /invitado/:code. No necesita cuenta; el link es el permiso.
export default function Guest() {
  const { code } = useParams()
  const [info, setInfo] = useState(null)
  const [name, setName] = useState(savedName)
  const [conn, setConn] = useState(null)
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [left, setLeft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/guest/check', { method: 'POST', body: { code } })
      .then(setInfo)
      .catch((e) => {
        setInvalid(true)
        setError(e.message)
      })
  }, [code])

  const join = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const d = await api('/guest/join', { method: 'POST', body: { code, name } })
      try {
        window.localStorage.setItem(NAME_KEY, name.trim())
      } catch {
        /* sin almacenamiento: no pasa nada */
      }
      setLeft('')
      setConn(d)
    } catch (err) {
      if (err.status === 404) setInvalid(true)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const onDisconnected = (reason) => {
    setConn(null)
    if (reason === DisconnectReason.PARTICIPANT_REMOVED) setLeft('El anfitrión te sacó del estudio.')
    else if (reason === DisconnectReason.ROOM_DELETED) setLeft('La transmisión terminó. ¡Gracias por participar!')
    else if (reason === DisconnectReason.CLIENT_INITIATED) setLeft('Saliste del estudio.')
    else setLeft('Se perdió la conexión con el estudio.')
  }

  if (conn) {
    return (
      <LiveKitRoom
        token={conn.token}
        serverUrl={conn.ws_url}
        connect
        video
        audio
        className="studio"
        onDisconnected={onDisconnected}
        onError={() => setError('No se pudo conectar el video. Revisa que diste permiso a la cámara y al micrófono.')}
      >
        <GuestRoom title={conn.title} error={error} setError={setError} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    )
  }

  return (
    <div className="studio">
      <GuestBar title={info?.title} />
      <div className="center guest-center">
        {invalid ? (
          <div className="card guest-card">
            <h1 className="display">Link no válido</h1>
            <p className="muted" role="alert">{error}</p>
          </div>
        ) : !info ? (
          <p className="muted">Revisando el link…</p>
        ) : (
          <form className="card guest-card" onSubmit={join}>
            <h1 className="display">{info.host ? `${info.host} te invitó` : 'Te invitaron'}</h1>
            <p className="muted">a <strong>{info.title}</strong>. Entrarás tras bastidores; el anfitrión decide cuándo sales en escena.</p>
            {left && <p className="muted" role="status">{left}</p>}
            <label htmlFor="guest-name">Tu nombre (así te verán en pantalla)</label>
            <input
              id="guest-name"
              autoComplete="name"
              value={name}
              maxLength={40}
              required
              onChange={(e) => setName(e.target.value)}
            />
            {error && <p className="error" role="alert">{error}</p>}
            <p className="muted small">Al entrar, el navegador te pedirá permiso para la cámara y el micrófono.</p>
            <button className="btn primary" disabled={busy || !name.trim()}>
              {busy ? 'Entrando…' : left ? 'Volver a entrar' : 'Entrar al estudio'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function GuestRoom({ title, error, setError }) {
  const room = useRoomContext()
  const [stage, setStage] = useState(null)

  // El lienzo lo manda el anfitrión; parseStage ignora lo que no venga de él.
  useDataChannel(STAGE_TOPIC, (msg) => {
    const st = parseStage(msg.payload, msg.from?.identity)
    if (st) setStage(st)
  })

  const sources = useStageSources()
  const onStage = (stage?.ids || []).map((sid) => sources.find((s) => s.id === sid)).filter(Boolean)
  const me = sources.find((s) => s.isLocal && !s.isScreen)
  const amOnStage = onStage.some((s) => s.isLocal)

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()
  const [showSettings, setShowSettings] = useState(false)
  const safely = (fn) => async () => {
    try {
      await fn()
    } catch {
      setError('No se pudo usar ese dispositivo. Revisa los permisos del navegador.')
    }
  }
  const toggleMic = safely(() => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))
  const toggleCam = safely(() => localParticipant.setCameraEnabled(!isCameraEnabled))
  const toggleShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
    } catch {
      /* canceló el permiso de compartir */
    }
  }

  // Si el anfitrión activó subtítulos, tu voz se transcribe aquí y se le manda solo a él.
  const { send: sendCaption } = useDataChannel(CAPTION_TOPIC)
  const hostIds = useRemoteParticipants().filter((p) => isHost(p.identity)).map((p) => p.identity)
  const lastInterim = useRef(0)
  const captionsOn = Boolean(stage?.captions) && isMicrophoneEnabled && hostIds.length > 0
  const shareCaption = (text, final) => {
    const now = Date.now()
    if (!final && now - lastInterim.current < 300) return // no saturar el canal con cada sílaba
    lastInterim.current = now
    Promise.resolve(
      sendCaption(encodeCaption(text, final), { reliable: final, destinationIdentities: hostIds })
    ).catch(() => {})
  }
  useSpeechCaptions({
    enabled: captionsOn,
    onInterim: (t) => shareCaption(t, false),
    onFinal: (t) => shareCaption(t, true)
  })

  return (
    <>
      <GuestBar title={title} inRoom>
        <span className={`stage-status${amOnStage ? ' on' : ''}`} role="status">
          {amOnStage ? 'EN ESCENA' : 'TRAS BASTIDORES'}
        </span>
        <button className="btn danger" onClick={() => room.disconnect()}>Salir</button>
      </GuestBar>

      {error && (
        <div className="studio-alert" role="alert">
          <span>{error}</span>
          <button className="icon-btn" aria-label="Cerrar aviso" onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="studio-body">
        <main className="studio-main">
          <Stage
            layout={stage?.layout || 'duo'}
            onStage={onStage}
            style={stage?.style || DEFAULT_STYLE}
            banner={stage?.banner}
            comment={stage?.comment}
            caption={stage?.caption}
            emptyText={stage ? 'Nadie está en escena todavía' : 'Esperando al anfitrión…'}
          />
          <p className="muted small">
            {amOnStage
              ? 'Estás en escena: lo que digas y muestres se ve en la transmisión.'
              : 'Estás tras bastidores: el público no te ve ni te escucha. El anfitrión sí.'}
            {captionsOn && ' Subtítulos en vivo activados: tu voz se transcribe en este navegador.'}
          </p>

          {me && !amOnStage && (
            <section className="backstage" aria-label="Tu cámara">
              <span className="section-label">TU CÁMARA</span>
              <div className="self-view">
                <Stage layout="solo" onStage={[me]} style={{ ...DEFAULT_STYLE, showLogo: false }} />
              </div>
            </section>
          )}

          <div className="controls" role="toolbar" aria-label="Controles">
            <button className="ctrl" aria-pressed={!isMicrophoneEnabled} onClick={toggleMic}>
              <span aria-hidden="true">🎙</span>{isMicrophoneEnabled ? 'Silenciar' : 'Activar mic'}
            </button>
            <button className="ctrl" aria-pressed={!isCameraEnabled} onClick={toggleCam}>
              <span aria-hidden="true">📷</span>{isCameraEnabled ? 'Apagar cámara' : 'Encender cámara'}
            </button>
            <button className="ctrl" aria-pressed={isScreenShareEnabled} onClick={toggleShare}>
              <span aria-hidden="true">🖥</span>{isScreenShareEnabled ? 'Dejar de presentar' : 'Presentar'}
            </button>
            <button className="ctrl" aria-expanded={showSettings} onClick={() => setShowSettings((v) => !v)}>
              <span aria-hidden="true">⚙</span>Ajustes
            </button>
          </div>
          {showSettings && <DeviceSettings onError={setError} />}
        </main>

        <aside className="guest-chat card" aria-label="Chat privado">
          <h2>Chat privado</h2>
          <PrivateChat />
        </aside>
      </div>
    </>
  )
}
