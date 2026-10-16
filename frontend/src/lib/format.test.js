import { describe, expect, it } from 'vitest'
import { formatBytes, formatDate } from './format.js'

describe('formatBytes', () => {
  it('usa la unidad adecuada', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(250 * 1024 * 1024)).toBe('250 MB')
    expect(formatBytes(3.2 * 1024 ** 3)).toBe('3.2 GB')
  })
  it('ignora valores raros', () => {
    expect(formatBytes(-1)).toBe('')
    expect(formatBytes('x')).toBe('')
  })
})

describe('formatDate', () => {
  it('regresa vacío si la fecha no sirve', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('no-fecha')).toBe('')
    expect(formatDate('2026-10-16T10:00:00Z')).not.toBe('')
  })
})
