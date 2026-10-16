// Lógica pura del estudio: diseños, escenas y cómo se acomodan las fuentes en el lienzo.
// No depende de React ni de LiveKit, así se puede probar con vitest.

// Diseños disponibles (como en el prototipo). `cols` dibuja el mini ícono del botón.
export const LAYOUTS = [
  { id: 'solo', label: 'Solo', cells: 1, cols: '1fr' },
  { id: 'duo', label: 'Dúo', cells: 2, cols: '1fr 1fr' },
  { id: 'grid', label: 'Grupo', cells: 4, cols: '1fr 1fr' },
  { id: 'leader', label: 'Líder', cells: 2, cols: '2fr 1fr' },
  { id: 'pres', label: 'Pantalla grande', cells: 2, cols: '3fr 1fr' },
  { id: 'full', label: 'Pantalla completa', cells: 1, cols: '1fr' }
]

export const LAYOUT_IDS = LAYOUTS.map((l) => l.id)

// Escenas predefinidas: un atajo que cambia diseño, quién está en escena y el banner.
// `pick` recibe las fuentes disponibles y regresa los ids que deben quedar en escena.
export const SCENES = [
  {
    id: 'intro', name: 'Intro', desc: 'Solo anfitrión + banner', layout: 'solo', cells: 1, cols: '1fr',
    showBanner: true,
    pick: (sources) => firstOf(sources, (s) => s.isLocal && !s.isScreen)
  },
  {
    id: 'conv', name: 'Conversación', desc: 'Anfitrión e invitado', layout: 'duo', cells: 2, cols: '1fr 1fr',
    pick: (sources) => [
      ...firstOf(sources, (s) => s.isLocal && !s.isScreen),
      ...firstOf(sources, (s) => !s.isLocal && !s.isScreen)
    ]
  },
  {
    id: 'panel', name: 'Panel', desc: 'Hasta 4 personas', layout: 'grid', cells: 4, cols: '1fr 1fr',
    pick: (sources) => sources.filter((s) => !s.isScreen).slice(0, 4).map((s) => s.id)
  },
  {
    id: 'demo', name: 'Demo', desc: 'Pantalla + anfitrión', layout: 'pres', cells: 2, cols: '3fr 1fr',
    needsScreen: true,
    pick: (sources) => [
      ...firstOf(sources, (s) => s.isScreen),
      ...firstOf(sources, (s) => s.isLocal && !s.isScreen)
    ]
  }
]

function firstOf(sources, test) {
  const found = sources.find(test)
  return found ? [found.id] : []
}

// Máximo de fuentes que muestra cada diseño.
const MAX = { solo: 1, full: 1, duo: 2, grid: 6, leader: 4, pres: 4 }

/**
 * Decide qué se dibuja en el lienzo.
 * @param {string} layout  id del diseño
 * @param {Array<{id:string,isScreen:boolean}>} onStage  fuentes en escena, en orden
 * @returns {{mode:'empty'|'grid'|'pres', tiles:Array, main?:object, side?:Array, cols:number, rows:number}}
 */
export function composeStage(layout, onStage) {
  const id = LAYOUT_IDS.includes(layout) ? layout : 'duo'
  const items = onStage.slice(0, MAX[id])
  if (items.length === 0) return { mode: 'empty', tiles: [], cols: 0, rows: 0 }

  if (id === 'full') {
    // Pantalla completa: si hay pantalla compartida, gana ella.
    const main = onStage.find((s) => s.isScreen) || onStage[0]
    return { mode: 'grid', tiles: [main], cols: 1, rows: 1 }
  }

  if ((id === 'leader' || id === 'pres') && onStage.length > 1) {
    // Líder: la persona principal grande. Pantalla grande: la pantalla compartida grande.
    const main = id === 'pres'
      ? onStage.find((s) => s.isScreen) || onStage[0]
      : onStage.find((s) => !s.isScreen) || onStage[0]
    const side = onStage.filter((s) => s.id !== main.id).slice(0, 3)
    return { mode: 'pres', tiles: [main, ...side], main, side, cols: 2, rows: 1 }
  }

  const n = items.length
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3
  const rows = Math.ceil(n / cols)
  return { mode: 'grid', tiles: items, cols, rows }
}

// LiveKit Egress solo conoce sus plantillas: aquí traducimos nuestro diseño a la más parecida.
export function egressLayout(layout) {
  if (layout === 'solo' || layout === 'full') return 'single-speaker'
  if (layout === 'leader' || layout === 'pres') return 'speaker'
  return 'grid'
}

// Texto corto para la barra superior: "Transmitiendo a YouTube y Facebook".
export function destSummary(kind, names) {
  if (kind === 'recording') return 'Grabación · no sale en vivo'
  if (names.length === 0) return 'Sin destinos elegidos'
  if (names.length === 1) return `Transmitir a ${names[0]}`
  return `Transmitir a ${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

// Reloj de transmisión: 65 s → "01:05", 3725 s → "1:02:05".
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (x) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
}

// Iniciales para cuando no hay cámara: "Juan González" → "JG".
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase()
}

// Validación de banners: texto sin espacios de más, 1 a 120 caracteres.
export const BANNER_MAX = 120
export function cleanBanner(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t || t.length > BANNER_MAX) return null
  return t
}
