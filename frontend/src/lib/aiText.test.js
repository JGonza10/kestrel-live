import { describe, expect, it } from 'vitest'
import { clipRange, youtubeDescription } from './aiText.js'

describe('youtubeDescription', () => {
  it('agrega los capítulos con tiempos', () => {
    const r = { youtube_description: 'Hablamos de LiveKit.', chapters: [{ start: 0, title: 'Intro' }, { start: 754, title: 'Demo' }] }
    expect(youtubeDescription(r)).toBe('Hablamos de LiveKit.\n\nCapítulos:\n00:00 Intro\n12:34 Demo')
  })
  it('sin capítulos queda solo el texto', () => {
    expect(youtubeDescription({ youtube_description: 'Hola', chapters: [] })).toBe('Hola')
    expect(youtubeDescription(null)).toBe('')
  })
})

describe('clipRange', () => {
  it('muestra inicio, fin y duración', () => {
    expect(clipRange({ start: 45, end: 90 })).toBe('00:45 – 01:30 · 45 s')
  })
})
