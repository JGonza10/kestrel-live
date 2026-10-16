// Formatos para mostrar: tamaños de archivo y fechas en español de México.

export function formatBytes(n) {
  const b = Number(n)
  if (!Number.isFinite(b) || b < 0) return ''
  if (b < 1024) return `${b} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = b
  let i = -1
  do {
    v /= 1024
    i++
  } while (v >= 1024 && i < units.length - 1)
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`
}

export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}
