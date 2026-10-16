// Lógica pura de la página de salida (/salida) que abre LiveKit Egress.

const DEFAULT_STYLE = { theme: 'bubble', color: '#a85a22', showNames: true, showLogo: true }

/** Lee ?url=ws://…&token=… que pone Egress. Regresa null si falta algo o no es un WebSocket. */
export function outputParams(search) {
  const q = new URLSearchParams(search)
  const url = q.get('url') || ''
  const token = q.get('token') || ''
  if (!/^wss?:\/\//.test(url) || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null
  return { url, token }
}

/** Mientras no llega el lienzo del anfitrión: todas las cámaras en cuadrícula. */
export function defaultStage(sources) {
  const cams = sources.filter((s) => !s.isScreen).slice(0, 6).map((s) => s.id)
  return { layout: cams.length <= 1 ? 'solo' : 'grid', ids: cams, style: DEFAULT_STYLE, banner: null }
}
