import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'

const SAVE_DELAY_MS = 800

// Marca del estudio guardada en el servidor (banners, estilo, teleprompter).
// Se carga al entrar y se guarda sola 0.8 s después del último cambio,
// así escribir el guion no manda una petición por cada letra.
export function useServerLook(initial, onError) {
  const [look, setLookState] = useState(initial)
  const [loaded, setLoaded] = useState(false)
  const timer = useRef(null)
  const latest = useRef(initial)
  const errorRef = useRef(onError)
  errorRef.current = onError

  useEffect(() => {
    api('/studio/look')
      .then((d) => {
        latest.current = { ...initial, ...d.look }
        setLookState(latest.current)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = useCallback(() => {
    timer.current = null
    api('/studio/look', { method: 'PUT', body: latest.current }).catch(() =>
      errorRef.current?.('No se pudo guardar tu marca. Revisa tu conexión.')
    )
  }, [])

  const setLook = useCallback(
    (updater) => {
      setLookState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        latest.current = next
        return next
      })
      clearTimeout(timer.current)
      timer.current = setTimeout(save, SAVE_DELAY_MS)
    },
    [save]
  )

  // Si se sale del estudio con un cambio pendiente, se guarda de una vez.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current)
        save()
      }
    },
    [save]
  )

  return [look, setLook, loaded]
}
