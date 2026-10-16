// Lista de comentarios del chat: une lo nuevo sin repetir y guarda solo los últimos.
export const MAX_COMMENTS = 200

export function mergeComments(prev, incoming, max = MAX_COMMENTS) {
  if (!Array.isArray(incoming) || incoming.length === 0) return prev
  const seen = new Set(prev.map((c) => c.id))
  const fresh = incoming.filter((c) => c && typeof c.id === 'string' && !seen.has(c.id) && seen.add(c.id))
  if (fresh.length === 0) return prev
  return [...prev, ...fresh].slice(-max)
}

// Cada cuánto preguntar: lo que diga el servidor, pero nunca menos de 5 s ni más de 60 s.
export function nextPoll(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(60000, Math.max(5000, n))
}
