// Sincroniza el lienzo del anfitrión con los invitados por el canal de datos de LiveKit.
// El anfitrión manda {layout, ids, style, banner}; el invitado lo valida antes de usarlo.
// Lógica pura (sin React ni LiveKit) para poder probarla con vitest.
import { BANNER_MAX, LAYOUT_IDS } from './layouts.js'

export const STAGE_TOPIC = 'kl-stage'
export const THEME_IDS = ['bubble', 'classic', 'minimal', 'block']
const MAX_IDS = 12
const MAX_BYTES = 4000

// Solo el anfitrión puede mover el lienzo. Su identidad la pone el servidor en el token
// (host-<id>); los invitados son guest-<hex>, así que no pueden hacerse pasar por él.
export const isHost = (identity) => typeof identity === 'string' && identity.startsWith('host-')

export function encodeStage({ layout, ids, style, banner, comment, caption, captions }) {
  const msg = {
    v: 1, layout, ids, style, banner: banner || null, comment: comment || null,
    caption: caption || null, captions: Boolean(captions)
  }
  return new TextEncoder().encode(JSON.stringify(msg))
}

/**
 * Lee un mensaje del canal. Regresa el estado limpio o null si no es válido
 * o no viene del anfitrión.
 */
export function parseStage(payload, senderIdentity) {
  if (!isHost(senderIdentity) || !(payload instanceof Uint8Array) || payload.length > MAX_BYTES) return null
  let msg
  try {
    msg = JSON.parse(new TextDecoder().decode(payload))
  } catch {
    return null
  }
  if (!msg || typeof msg !== 'object' || msg.v !== 1) return null
  if (!LAYOUT_IDS.includes(msg.layout) || !Array.isArray(msg.ids)) return null

  const ids = msg.ids.filter((x) => typeof x === 'string' && x.length <= 200).slice(0, MAX_IDS)
  const s = msg.style && typeof msg.style === 'object' ? msg.style : {}
  const style = {
    theme: THEME_IDS.includes(s.theme) ? s.theme : 'bubble',
    color: typeof s.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color : '#a85a22',
    showNames: s.showNames !== false,
    showLogo: s.showLogo !== false
  }
  const banner = typeof msg.banner === 'string' && msg.banner.length <= BANNER_MAX ? msg.banner : null
  return {
    layout: msg.layout, ids, style, banner,
    comment: cleanComment(msg.comment),
    caption: cleanCaption(msg.caption),
    captions: msg.captions === true
  }
}

export const COMMENT_PLATFORMS = ['youtube', 'facebook']

// Comentario en escena: autor y texto cortos, de una plataforma conocida.
export function cleanComment(c) {
  if (!c || typeof c !== 'object') return null
  const author = typeof c.author === 'string' ? c.author.slice(0, 80) : ''
  const text = typeof c.text === 'string' ? c.text.slice(0, 300) : ''
  if (!text || !COMMENT_PLATFORMS.includes(c.platform)) return null
  return { author: author || 'Alguien', text, platform: c.platform }
}

// Subtítulo en escena: quién habla y lo que va diciendo (corto).
export const CAPTION_MAX = 200
export function cleanCaption(c) {
  if (!c || typeof c !== 'object' || typeof c.text !== 'string' || !c.text.trim()) return null
  const speaker = typeof c.speaker === 'string' ? c.speaker.slice(0, 80) : ''
  // Se queda con el final: es lo que se acaba de decir.
  return { speaker, text: c.text.trim().slice(-CAPTION_MAX) }
}

// Subtítulos que un invitado le manda al anfitrión (canal kl-caption).
export const CAPTION_TOPIC = 'kl-caption'
export function encodeCaption(text, final) {
  return new TextEncoder().encode(JSON.stringify({ v: 1, text: String(text).slice(0, 500), final: Boolean(final) }))
}
export function parseCaption(payload, senderIdentity) {
  if (!isGuest(senderIdentity) || !(payload instanceof Uint8Array) || payload.length > 3000) return null
  try {
    const m = JSON.parse(new TextDecoder().decode(payload))
    if (m?.v !== 1 || typeof m.text !== 'string' || !m.text.trim()) return null
    return { text: m.text.trim().slice(0, 500), final: m.final === true }
  } catch {
    return null
  }
}

// Link que se comparte: https://mi-laptop:5173/invitado/<código>
export const guestLink = (origin, code) => `${origin}/invitado/${encodeURIComponent(code)}`

// Las identidades de invitado vienen del servidor: guest-<12 hex>.
export const isGuest = (identity) => /^guest-[0-9a-f]{12}$/.test(String(identity))
