import { useEffect, useState } from 'react'

// Estado que se recuerda en este navegador (banners, estilo, guion).
// Si el navegador bloquea el almacenamiento, la app sigue funcionando sin recordar.
export function useSticky(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw ? { ...initial, ...JSON.parse(raw) } : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [key, value])

  return [value, setValue]
}
