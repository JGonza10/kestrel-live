import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useDataChannel,
  useLocalParticipant,
  useRemoteParticipants
} from '@livekit/components-react'
import { api } from '../api.js'
import Logo from '../components/Logo.jsx'
import Stage from '../studio/Stage.jsx'
import DeviceSettings from '../studio/DeviceSettings.jsx'
import SidePanel, { SWATCHES, abbr } from '../studio/SidePanel.jsx'
import { LAYOUTS, SCENES, destSummary, egressLayout, formatClock, initials } from '../studio/layouts.js'
import { useServerLook } from '../studio/useServerLook.js'
import { useComments } from '../studio/useComments.js'
import { useSpeechCaptions } from '../studio/useSpeechCaptions.js'
import { makeSegment, takeBatch } from '../studio/transcript.js'
import { CAPTION_TOPIC, STAGE_TOPIC, encodeStage, guestLink, isGuest, parseCaption } from '../studio/stageSync.js'
import { useStageSources } from '../studio/useStageSources.js'
import '../studio/studio.css'

const DEFAULT_LOOK = {
  banners: [],
  style: { theme: 'bubble', color: SWATCHES[0][0], showNames: true, showLogo: true },
  prompter: '',
  ai: { captions: false, moderation: true }
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
        studioOutput={Boolean(conn.studio_output)}
        error={error}
        setError={setError}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function StudioRoom({ broadcast, setBroadcast, dests, studioOutput, error, setError }) {
  const id = broadcast.id
  const [look, setLook] = useServerLook(DEFAULT_LOOK, setError)
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
  const sources = useStageSources()
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

  const ai = { ...DEFAULT_LOOK.ai, ...look.ai }
  const setAi = (patch) => setLook((l) => ({ ...l, ai: { ...ai, ...patch } }))
  const running = ['live', 'recording'].includes(broadcast.status)

  // --- Comentarios de YouTube y Facebook (con moderación de Kestrel IA) ---
  const comments = useComments(id, ai.moderation)
  const [activeComment, setActiveComment] = useState(null)
  const [highlightNote, setHighlightNote] = useState('')
  const toggleComment = (c) => {
    setHighlightNote('')
    setActiveComment((a) => (a?.id === c.id ? null : c))
  }
  const commentOnAir = activeComment
    ? { author: activeComment.author, text: activeComment.text, platform: activeComment.platform }
    : null
  const highlightQuestion = async () => {
    const recent = comments.items.slice(-100).map(({ id: cid, author, text }) => ({ id: cid, author, text }))
    const d = await api(`/broadcasts/${id}/comments/highlight`, { method: 'POST', body: { comments: recent } })
    const chosen = comments.items.find((c) => c.id === d.id)
    if (chosen) {
      setActiveComment(chosen)
      setHighlightNote(d.reason)
    }
  }

  // --- Subtítulos en vivo: tu voz (en este navegador) y la de tus invitados (en el suyo) ---
  const [caption, setCaption] = useState(null)
  const captionTimer = useRef(null)
  const showCaption = (speaker, text) => {
    setCaption({ speaker, text })
    clearTimeout(captionTimer.current)
    captionTimer.current = setTimeout(() => setCaption(null), 4000)
  }
  const segmentQueue = useRef([])
  const pushSegment = (speaker, text) => {
    if (!running) return // la transcripción solo cuenta mientras se transmite o graba
    const seg = makeSegment(broadcast.started_at, speaker, text)
    if (seg) segmentQueue.current = [...segmentQueue.current, seg].slice(-2000)
  }
  const flushTranscript = useCallback(async () => {
    while (segmentQueue.current.length > 0) {
      const [batch, rest] = takeBatch(segmentQueue.current)
      segmentQueue.current = rest
      try {
        await api(`/broadcasts/${id}/transcript`, { method: 'POST', body: { segments: batch } })
      } catch {
        segmentQueue.current = [...batch, ...segmentQueue.current].slice(-2000) // se reintenta luego
        return
      }
    }
  }, [id])
  useEffect(() => {
    if (!running) return undefined
    const t = setInterval(flushTranscript, 5000)
    return () => clearInterval(t)
  }, [running, flushTranscript])
  const myName = localParticipant?.name || 'Anfitrión'
  useSpeechCaptions({
    enabled: ai.captions && isMicrophoneEnabled,
    onInterim: (t) => showCaption(myName, t),
    onFinal: (t) => {
      showCaption(myName, t)
      pushSegment(myName, t)
    },
    onError: setError
  })
  useDataChannel(CAPTION_TOPIC, (msg) => {
    if (!ai.captions) return
    const c = parseCaption(msg.payload, msg.from?.identity)
    if (!c) return
    const name = msg.from?.name || 'Invitado'
    showCaption(name, c.text)
    if (c.final) pushSegment(name, c.text)
  })
  const captionOnAir = ai.captions ? caption : null

  // --- Invitados y salida al aire ven el mismo lienzo: se manda por el canal de datos ---
  // Egress entra como participante oculto (no aparece en la lista), por eso se publica
  // siempre, y más seguido mientras se transmite para que arranque rápido.
  const { send: sendStage } = useDataChannel(STAGE_TOPIC)
  const remoteCount = useRemoteParticipants().length
  const stageKey = JSON.stringify({
    layout, ids: stageIds, style, banner: bannerText || null, comment: commentOnAir,
    caption: captionOnAir, captions: ai.captions
  })
  useEffect(() => {
    const publish = () => {
      Promise.resolve(sendStage(encodeStage(JSON.parse(stageKey)), { reliable: true })).catch(() => {})
    }
    publish()
    const t = setInterval(publish, running ? 2000 : 5000)
    return () => clearInterval(t)
  }, [stageKey, remoteCount, running, sendStage])

  const removeGuest = async (source) => {
    if (!window.confirm(`¿Sacar a ${source.name} del estudio?`)) return
    try {
      await api(`/broadcasts/${id}/guests/remove`, { method: 'POST', body: { identity: source.identity } })
    } catch (e) {
      setError(e.message)
    }
  }

  // --- Salir en vivo / grabar / terminar ---
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
      await flushTranscript() // lo último que se dijo, antes de cerrar
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
          <Link className="btn ghost-light" to={`/biblioteca/${id}`}>Finalizada · Ver resumen</Link>
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

          <Stage layout={layout} onStage={onStage} style={style} banner={bannerText} comment={commentOnAir} caption={captionOnAir} />

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
          {running && !studioOutput && (
            <p className="muted small">
              Lo que sale al aire usa la plantilla de LiveKit más parecida al diseño con el que iniciaste.
            </p>
          )}

          <section className="backstage" aria-label="Tras bastidores">
            <div className="backstage-head">
              <span className="section-label">TRAS BASTIDORES</span>
              <GuestInvite broadcastId={id} disabled={ended} onError={setError} />
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
                    {!s.isScreen && isGuest(s.identity) && (
                      <button className="btn small-btn" onClick={() => removeGuest(s)}>Sacar del estudio</button>
                    )}
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
          comments={comments}
          activeComment={activeComment}
          onToggleComment={toggleComment}
          filteredCount={ai.moderation ? comments.filtered : 0}
          onHighlight={highlightQuestion}
          highlightNote={highlightNote}
          ai={ai}
          onAi={setAi}
        />
      </div>
    </>
  )
}

// Link de invitado: se crea al primer clic, se copia y se puede cambiar o desactivar.
function GuestInvite({ broadcastId, disabled, onError }) {
  const [code, setCode] = useState(null)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const link = code ? guestLink(window.location.origin, code) : ''

  useEffect(() => {
    api(`/broadcasts/${broadcastId}/invite`).then((d) => setCode(d.code)).catch(() => {})
  }, [broadcastId])

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setNote('Link copiado. Mándaselo a tu invitado.')
    } catch {
      // Sin permiso de portapapeles (p. ej. http fuera de localhost): se copia a mano.
      setNote('Selecciona el link y cópialo.')
    }
  }

  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      onError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const getLink = () => run(async () => {
    let c = code
    if (!c) {
      c = (await api(`/broadcasts/${broadcastId}/invite`, { method: 'POST' })).code
      setCode(c)
    }
    setOpen(true)
    await copy(guestLink(window.location.origin, c))
  })

  const rotate = () => run(async () => {
    if (!window.confirm('El link anterior dejará de servir. ¿Crear uno nuevo?')) return
    const c = (await api(`/broadcasts/${broadcastId}/invite`, { method: 'POST' })).code
    setCode(c)
    await copy(guestLink(window.location.origin, c))
  })

  const revoke = () => run(async () => {
    if (!window.confirm('Nadie más podrá entrar con el link. Los que ya están adentro se quedan. ¿Desactivar?')) return
    await api(`/broadcasts/${broadcastId}/invite`, { method: 'DELETE' })
    setCode(null)
    setOpen(false)
    setNote('')
  })

  return (
    <div className="invite">
      <button className="btn small-btn primary" onClick={getLink} disabled={disabled || busy}>
        Copiar link de invitado
      </button>
      {open && code && (
        <div className="invite-box card">
          <label htmlFor="guest-link" className="small">Link de invitado</label>
          <input id="guest-link" readOnly value={link} onFocus={(e) => e.target.select()} />
          {note && <p className="muted small" role="status">{note}</p>}
          <div className="invite-actions">
            <button className="btn small-btn" onClick={rotate} disabled={busy}>Crear link nuevo</button>
            <button className="btn small-btn" onClick={revoke} disabled={busy}>Desactivar</button>
            <button className="btn small-btn" onClick={() => setOpen(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
