import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useMediaDeviceSelect,
  useTracks
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { api } from '../api.js'
import Logo from '../components/Logo.jsx'
import Stage from '../studio/Stage.jsx'
import SidePanel, { SWATCHES, abbr } from '../studio/SidePanel.jsx'
import { LAYOUTS, SCENES, destSummary, egressLayout, formatClock, initials } from '../studio/layouts.js'
import { useSticky } from '../studio/useSticky.js'
import '../studio/studio.css'

const DEFAULT_LOOK = {
  banners: [],
  style: { theme: 'bubble', color: SWATCHES[0][0], showNames: true, showLogo: true },
  prompter: ''
}

// Página del estudio: carga la transmisión, pide el token y conecta con LiveKit.
export default function Studio() {
  const { id } = useParams()
  const [broadcast, setBroadcast] = useState(null)
  const [conn, setConn] = useState(null)
  const [dests, setDests] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api(`/broadcasts/${id}`).then((d) => setBroadcast(d.item)).catch((e) => setError(e.message))
    api(`/broadcasts/${id}/token`, { method: 'POST' }).then(setConn).catch((e) => setError(e.message))
    api('/destinations').then((d) => setDests(d.items)).catch(() => {})
  }, [id])

  if (!conn || !broadcast) {
    return (
      <div className="studio">
        <header className="studio-bar">
          <Link to="/" className="brand"><Logo size={26} /><span className="display">Kestrel Live</span></Link>
        </header>
        <div className="center muted">
          {error ? <p className="error" role="alert">{error}</p> : 'Conectando al estudio…'}
        </div>
      </div>
    )
  }

  return (
    <LiveKitRoom
      token={conn.token}
      serverUrl={conn.ws_url}
      connect
      video
      audio
      className="studio"
      onError={() => setError('No se pudo conectar el video. Revisa que LiveKit esté encendido y que diste permiso a la cámara.')}
    >
      <StudioRoom
        broadcast={broadcast}
        setBroadcast={setBroadcast}
        dests={dests}
        error={error}
        setError={setError}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function StudioRoom({ broadcast, setBroadcast, dests, error, setError }) {
  const id = broadcast.id
  const [look, setLook] = useSticky(`kl-studio-${id}`, DEFAULT_LOOK)
  const banners = Array.isArray(look.banners)
    ? look.banners.filter((b) => b && typeof b.text === 'string' && typeof b.id === 'string')
    : []
  const style = { ...DEFAULT_LOOK.style, ...look.style }

  const [layout, setLayout] = useState('duo')
  const [scene, setScene] = useState(null)
  const [stageIds, setStageIds] = useState([])
  const [activeBanner, setActiveBanner] = useState(null)
  const [selected, setSelected] = useState(() => dests.filter((d) => d.enabled).map((d) => d.id))
  const [showPrompter, setShowPrompter] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scenesOpen, setScenesOpen] = useState(true)
  const pendingScene = useRef(null)
  const seeded = useRef(false)

  // Cuando lleguen los destinos, preselecciona los activos.
  useEffect(() => {
    setSelected(dests.filter((d) => d.enabled).map((d) => d.id))
  }, [dests])

  // --- Fuentes de video: cámara de cada persona y pantallas compartidas ---
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  )
  const sources = useMemo(
    () =>
      tracks.map((ref) => ({
        id: `${ref.participant.identity}:${ref.source}`,
        isScreen: ref.source === Track.Source.ScreenShare,
        isLocal: ref.participant.isLocal,
        name: ref.participant.name || ref.participant.identity,
        trackRef: ref
      })),
    [tracks]
  )
  const onStage = stageIds.map((sid) => sources.find((s) => s.id === sid)).filter(Boolean)

  // Al entrar, el anfitrión aparece en escena.
  useEffect(() => {
    if (seeded.current) return
    const me = sources.find((s) => s.isLocal && !s.isScreen)
    if (me) {
      seeded.current = true
      setStageIds([me.id])
    }
  }, [sources])

  // --- Controles de mic, cámara y pantalla ---
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant()
  const safely = (fn) => async (...args) => {
    try {
      await fn(...args)
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
      pendingScene.current = null // cancelaron el permiso de compartir: no pasa nada
    }
  }

  // --- Escenas ---
  const applyScene = useCallback(
    (sc, available) => {
      setScene(sc.id)
      setLayout(sc.layout)
      setStageIds(sc.pick(available))
      if (sc.showBanner && banners.length > 0) setActiveBanner((b) => b ?? banners[0].id)
    },
    [banners]
  )

  const pickScene = async (sc) => {
    if (sc.needsScreen && !sources.some((s) => s.isScreen)) {
      pendingScene.current = sc
      await toggleShare()
      return
    }
    applyScene(sc, sources)
  }

  // Si la escena esperaba la pantalla compartida, se aplica en cuanto llega.
  useEffect(() => {
    const sc = pendingScene.current
    if (sc && sources.some((s) => s.isScreen)) {
      pendingScene.current = null
      applyScene(sc, sources)
    }
  }, [sources, applyScene])

  // Si una fuente desaparece (alguien se fue o dejó de compartir), sale de escena.
  useEffect(() => {
    setStageIds((ids) => {
      const kept = ids.filter((sid) => sources.some((s) => s.id === sid))
      return kept.length === ids.length ? ids : kept
    })
  }, [sources])

  const toggleOnStage = (sid) => {
    setScene(null)
    setStageIds((ids) => (ids.includes(sid) ? ids.filter((x) => x !== sid) : [...ids, sid]))
  }

  // --- Banners, estilo y teleprompter (se recuerdan en este navegador) ---
  const addBanner = (text) =>
    setLook((l) => ({ ...l, banners: [...banners, { id: `b${Date.now().toString(36)}`, text }] }))
  const removeBanner = (bid) => {
    setLook((l) => ({ ...l, banners: banners.filter((b) => b.id !== bid) }))
    setActiveBanner((a) => (a === bid ? null : a))
  }
  const toggleBanner = (bid) => setActiveBanner((a) => (a === bid ? null : bid))
  const setStyle = (patch) => setLook((l) => ({ ...l, style: { ...style, ...patch } }))
  const setPrompter = (text) => setLook((l) => ({ ...l, prompter: text.slice(0, 5000) }))
  const bannerText = banners.find((b) => b.id === activeBanner)?.text

  // --- Salir en vivo / grabar / terminar ---
  const running = ['live', 'recording'].includes(broadcast.status)
  const ended = broadcast.status === 'ended'
  const isRecording = broadcast.kind === 'recording'
  const chosen = dests.filter((d) => selected.includes(d.id))

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await api(`/broadcasts/${id}/start`, {
        method: 'POST',
        body: { destination_ids: selected, layout: egressLayout(layout) }
      })
      setBroadcast(d.item)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const stop = async () => {
    if (!window.confirm(isRecording ? '¿Terminar la grabación?' : '¿Terminar la transmisión?')) return
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

  // Reloj mientras está en vivo.
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  const elapsed = running && broadcast.started_at ? (now - new Date(broadcast.started_at).getTime()) / 1000 : 0

  return (
    <>
      <header className="studio-bar">
        <Link to="/" className="brand" aria-label="Volver al inicio"><Logo size={26} /><span className="display hide-sm">Kestrel Live</span></Link>
        <span className="bar-sep hide-sm" />
        <div className="grow">
          <strong className="ellipsis">{broadcast.title}</strong>
          <span className="bar-sub">{destSummary(broadcast.kind, chosen.map((d) => d.name))}</span>
        </div>
        {!isRecording && (
          <div className="bar-chips" aria-hidden="true">
            {chosen.map((d) => <span key={d.id} className={`badge ${d.platform}`}>{abbr(d.platform)}</span>)}
          </div>
        )}
        {running && (
          <span className="live-badge"><span className="dot" />{broadcast.status === 'live' ? 'EN VIVO' : 'GRABANDO'} · {formatClock(elapsed)}</span>
        )}
        {running ? (
          <button className="btn danger" onClick={stop} disabled={busy}>Terminar</button>
        ) : ended ? (
          <Link className="btn ghost-light" to="/">Finalizada · Ir al inicio</Link>
        ) : (
          <button className="btn primary" onClick={start} disabled={busy || (!isRecording && selected.length === 0)}>
            {isRecording ? 'Grabar' : 'Salir en vivo'}
          </button>
        )}
      </header>

      {error && (
        <div className="studio-alert" role="alert">
          <span>{error}</span>
          <button className="icon-btn" aria-label="Cerrar aviso" onClick={() => setError('')}>×</button>
        </div>
      )}

      <div className="studio-body">
        <aside className={`scenes${scenesOpen ? '' : ' closed'}`} aria-label="Escenas">
          <button className="section-label as-btn" aria-expanded={scenesOpen} onClick={() => setScenesOpen((v) => !v)}>
            ESCENAS {scenesOpen ? '‹' : '›'}
          </button>
          {scenesOpen && SCENES.map((sc) => (
            <button key={sc.id} className="scene" aria-pressed={scene === sc.id} onClick={() => pickScene(sc)}>
              <span className="scene-thumb" style={{ gridTemplateColumns: sc.cols }}>
                {Array.from({ length: sc.cells }, (_, i) => <span key={i} />)}
              </span>
              <strong>{sc.name}</strong>
              <span className="muted small">{sc.desc}</span>
            </button>
          ))}
        </aside>

        <main className="studio-main">
          {showPrompter && look.prompter && (
            <div className="prompter" aria-label="Teleprompter (solo tú lo ves)">{look.prompter}</div>
          )}

          <Stage layout={layout} onStage={onStage} style={style} banner={bannerText} />

          <div className="layout-bar" role="group" aria-label="Diseño">
            <span className="section-label">DISEÑO</span>
            {LAYOUTS.map((l) => (
              <button key={l.id} className="layout-btn" aria-pressed={layout === l.id} onClick={() => { setLayout(l.id); setScene(null) }}>
                <span className="layout-icon" style={{ gridTemplateColumns: l.cols }}>
                  {Array.from({ length: l.cells }, (_, i) => <span key={i} />)}
                </span>
                {l.label}
              </button>
            ))}
          </div>
          {running && (
            <p className="muted small">
              Lo que sale al aire usa la plantilla de LiveKit más parecida al diseño con el que iniciaste.
            </p>
          )}

          <section className="backstage" aria-label="Tras bastidores">
            <div className="backstage-head">
              <span className="section-label">TRAS BASTIDORES</span>
              <button className="btn small-btn" disabled title="Pronto: link para que entren tus invitados">Copiar link de invitado · pronto</button>
            </div>
            <div className="backstage-list">
              {sources.map((s) => {
                const on = stageIds.includes(s.id)
                return (
                  <div key={s.id} className={`person${on ? ' on' : ''}`}>
                    <span className="person-thumb">{s.isScreen ? '▭' : initials(s.name)}</span>
                    <strong className="small ellipsis">{s.isScreen ? `Pantalla de ${s.name}` : s.name}</strong>
                    <span className="muted small">{s.isScreen ? 'Pantalla' : s.isLocal ? 'Anfitrión' : 'Invitado'}</span>
                    <button className={`btn small-btn${on ? '' : ' primary'}`} onClick={() => toggleOnStage(s.id)}>
                      {on ? 'Quitar de escena' : 'Agregar a escena'}
                    </button>
                  </div>
                )
              })}
            </div>
          </section>

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

        <SidePanel
          kind={broadcast.kind}
          running={running}
          dests={dests}
          selected={selected}
          onToggleDest={(did) => setSelected((s) => (s.includes(did) ? s.filter((x) => x !== did) : [...s, did]))}
          banners={banners}
          activeBanner={activeBanner}
          onAddBanner={addBanner}
          onRemoveBanner={removeBanner}
          onToggleBanner={toggleBanner}
          style={style}
          onStyle={setStyle}
          prompter={look.prompter || ''}
          onPrompter={setPrompter}
          showPrompter={showPrompter}
          onShowPrompter={setShowPrompter}
        />
      </div>
    </>
  )
}

function DeviceSelect({ kind, label, onError }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({
    kind,
    requestPermissions: true,
    onError: () => onError('No se pudo leer la lista de dispositivos.')
  })
  const fieldId = `dev-${kind}`
  return (
    <div className="stack">
      <label htmlFor={fieldId}>{label}</label>
      <select
        id={fieldId}
        value={activeDeviceId}
        onChange={(e) => setActiveMediaDevice(e.target.value).catch(() => onError('No se pudo cambiar el dispositivo.'))}
      >
        {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Dispositivo sin nombre'}</option>)}
      </select>
    </div>
  )
}

function DeviceSettings({ onError }) {
  return (
    <section className="settings card" aria-label="Ajustes de dispositivos">
      <DeviceSelect kind="videoinput" label="Cámara" onError={onError} />
      <DeviceSelect kind="audioinput" label="Micrófono" onError={onError} />
      <DeviceSelect kind="audiooutput" label="Bocinas" onError={onError} />
    </section>
  )
}
