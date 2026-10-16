// Junta las frases de los subtítulos y las manda al servidor por tandas (máx. 50 por envío).
export const BATCH_MAX = 50

export function makeSegment(startedAtIso, speaker, text, now = Date.now()) {
  const start = startedAtIso ? new Date(startedAtIso).getTime() : NaN
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500)
  const who = String(speaker || '').trim().slice(0, 80)
  if (!Number.isFinite(start) || !clean || !who) return null
  return { t_ms: Math.max(0, Math.round(now - start)), speaker: who, text: clean }
}

/** Saca hasta BATCH_MAX frases de la cola; regresa [tanda, resto]. */
export function takeBatch(queue) {
  return [queue.slice(0, BATCH_MAX), queue.slice(BATCH_MAX)]
}
