import { describe, expect, it } from 'vitest'
import { mergeComments, nextPoll } from './comments.js'

const c = (id) => ({ id, text: id })

describe('mergeComments', () => {
  it('agrega solo los nuevos y en orden', () => {
    expect(mergeComments([c('a')], [c('a'), c('b'), c('b')]).map((x) => x.id)).toEqual(['a', 'b'])
  })
  it('regresa la misma lista si no hay nada nuevo (no re-renderiza)', () => {
    const prev = [c('a')]
    expect(mergeComments(prev, [c('a')])).toBe(prev)
    expect(mergeComments(prev, [])).toBe(prev)
  })
  it('se queda con los últimos', () => {
    expect(mergeComments([c('a'), c('b')], [c('c')], 2).map((x) => x.id)).toEqual(['b', 'c'])
  })
  it('ignora basura', () => {
    expect(mergeComments([], [null, { text: 'sin id' }, c('ok')]).map((x) => x.id)).toEqual(['ok'])
  })
})

describe('nextPoll', () => {
  it('respeta límites', () => {
    expect(nextPoll(0)).toBe(0)
    expect(nextPoll(1000)).toBe(5000)
    expect(nextPoll(8000)).toBe(8000)
    expect(nextPoll(999999)).toBe(60000)
    expect(nextPoll('x')).toBe(0)
  })
})
