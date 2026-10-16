import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useDataChannel } from '@livekit/components-react'
import Stage from '../studio/Stage.jsx'
import { STAGE_TOPIC, parseStage } from '../studio/stageSync.js'
import { useStageSources } from '../studio/useStageSources.js'
import { defaultStage, outputParams } from '../studio/output.js'
import '../studio/studio.css'

// Ancho con el que se diseñó el lienzo; luego se escala al tamaño del video (1920×1080).
const BASE_W = 960
// Si el anfitrión no ha mandado su lienzo en este tiempo, se arranca con uno por defecto.
const START_TIMEOUT_MS = 8000

/**
 * Página que abre LiveKit Egress (Chrome sin pantalla) para componer la salida.
 * Egress la llama con ?url=<ws>&token=<jwt>; el token es de Egress (oculto, solo ve y escucha).
 * Pinta exactamente el lienzo que manda el anfitrión, y avisa a Egress con
 * START_RECORDING / END_RECORDING en la consola, como pide su protocolo.
 */
export default function Output() {
  const params = outputParams(window.location.search)
  if (!params) return <div className="output-root" />
  return (
    <LiveKitRoom
      serverUrl={params.url}
      token={params.token}
      connect
      video={false}
      audio={false}
      className="output-root"
      onDisconnected={() => console.log('END_RECORDING')}
    >
      <OutputStage />
      <RoomAudioRenderer />
    </LiveKitRoom>
  )
}

function OutputStage() {
  const sources = useStageSources()
  const [stage, setStage] = useState(null)
  const [timedOut, setTimedOut] = useState(false)
  const started = useRef(false)
  const [scale, setScale] = useState(1)

  useDataChannel(STAGE_TOPIC, (msg) => {
    const st = parseStage(msg.payload, msg.from?.identity)
    if (st) setStage(st)
  })

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), START_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [])

  // Egress empieza a grabar cuando ve este mensaje: esperamos a tener el lienzo real.
  useEffect(() => {
    if (!started.current && (stage || timedOut)) {
      started.current = true
      console.log('START_RECORDING')
    }
  }, [stage, timedOut])

  useLayoutEffect(() => {
    const fit = () => setScale(window.innerWidth / BASE_W)
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  const current = stage || defaultStage(sources)
  const onStage = current.ids.map((sid) => sources.find((s) => s.id === sid)).filter(Boolean)

  return (
    <div className="output-frame" style={{ width: BASE_W, transform: `scale(${scale})` }}>
      <Stage layout={current.layout} onStage={onStage} style={current.style} banner={current.banner} comment={current.comment} emptyText="" />
    </div>
  )
}
