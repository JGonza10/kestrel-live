import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { mergeComments, nextPoll } from './comments.js'

// Fuentes de comentarios de la transmisión y consulta periódica de los nuevos.
export function useComments(broadcastId, moderate = true) {
  const [sources, setSources] = useState({ youtube: '', facebook: '' })
  const [items, setItems] = useState([])
  const [errors, setErrors] = useState({})
  const [filtered, setFiltered] = useState(0)
  const [version, setVersion] = useState(0) // cambia al guardar fuentes para reiniciar la consulta
  const timer = useRef(null)

  useEffect(() => {
    api(`/broadcasts/${broadcastId}/comments/sources`).then((d) => setSources(d.sources)).catch(() => {})
  }, [broadcastId])

  useEffect(() => {
    let alive = true
    const poll = async () => {
      let wait = 15000 // si falla la consulta, se reintenta más tarde
      try {
        const d = await api(`/broadcasts/${broadcastId}/comments${moderate ? '?moderate=1' : ''}`)
        if (!alive) return
        setItems((prev) => mergeComments(prev, d.items))
        if (d.filtered) setFiltered((n) => n + d.filtered)
        setErrors(d.errors || {})
        wait = nextPoll(d.poll_ms)
        if (wait === 0) return // sin fuentes: no hay nada que consultar
      } catch {
        if (!alive) return
      }
      timer.current = setTimeout(poll, wait)
    }
    poll()
    return () => {
      alive = false
      clearTimeout(timer.current)
    }
  }, [broadcastId, version, moderate])

  const saveSources = useCallback(
    async (next) => {
      const d = await api(`/broadcasts/${broadcastId}/comments/sources`, { method: 'PUT', body: next })
      setSources(d.sources)
      setErrors({})
      setVersion((v) => v + 1)
    },
    [broadcastId]
  )

  return { sources, saveSources, items, errors, filtered }
}
