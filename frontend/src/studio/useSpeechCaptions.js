import { useEffect, useRef } from 'react'

// Subtítulos en vivo con el reconocimiento de voz del navegador (Chrome y Edge; gratis).
// Ojo: Chrome manda el audio a sus servidores para transcribirlo.
export const speechSupported = () =>
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

export function useSpeechCaptions({ enabled, lang = 'es-MX', onInterim, onFinal, onError }) {
  const cbs = useRef({})
  cbs.current = { onInterim, onFinal, onError }

  useEffect(() => {
    if (!enabled || !speechSupported()) return undefined
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true
    let stopped = false

    rec.onresult = (e) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) cbs.current.onFinal?.(r[0].transcript)
        else interim += r[0].transcript
      }
      if (interim.trim()) cbs.current.onInterim?.(interim)
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        stopped = true
        cbs.current.onError?.('El navegador no dio permiso para los subtítulos en vivo.')
      }
    }
    // Chrome se detiene solo tras un silencio: se vuelve a encender mientras siga activo.
    rec.onend = () => {
      if (stopped) return
      try {
        rec.start()
      } catch {
        /* ya estaba encendido */
      }
    }
    try {
      rec.start()
    } catch {
      /* ya estaba encendido */
    }
    return () => {
      stopped = true
      rec.onend = null
      try {
        rec.stop()
      } catch {
        /* ya estaba apagado */
      }
    }
  }, [enabled, lang])
}
