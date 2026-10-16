import { formatClock } from '../studio/layouts.js'

// Descripción lista para YouTube: el texto de la IA + capítulos con sus tiempos
// (YouTube los convierte en capítulos si el primero es 00:00).
export function youtubeDescription(report) {
  if (!report) return ''
  const chapters = (report.chapters || []).map((c) => `${formatClock(c.start)} ${c.title}`).join('\n')
  return chapters ? `${report.youtube_description}\n\nCapítulos:\n${chapters}` : report.youtube_description
}

// "00:45 – 01:30 · 45 s"
export function clipRange(clip) {
  return `${formatClock(clip.start)} – ${formatClock(clip.end)} · ${clip.end - clip.start} s`
}
