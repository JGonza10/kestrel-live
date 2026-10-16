import { describe, expect, it } from 'vitest'
import { BATCH_MAX, makeSegment, takeBatch } from './transcript.js'

describe('makeSegment', () => {
  const start = '2026-10-16T10:00:00Z'
  it('calcula el tiempo desde que inició', () => {
    expect(makeSegment(start, 'Gonza', '  hola   mundo ', Date.parse(start) + 61500)).toEqual({
      t_ms: 61500, speaker: 'Gonza', text: 'hola mundo'
    })
  })
  it('descarta frases vacías o sin inicio', () => {
    expect(makeSegment(start, 'Gonza', '   ')).toBeNull()
    expect(makeSegment(null, 'Gonza', 'hola')).toBeNull()
    expect(makeSegment(start, '', 'hola')).toBeNull()
  })
})

describe('takeBatch', () => {
  it('manda de 50 en 50', () => {
    const q = Array.from({ length: 120 }, (_, i) => i)
    const [batch, rest] = takeBatch(q)
    expect(batch).toHaveLength(BATCH_MAX)
    expect(rest).toHaveLength(70)
  })
})
