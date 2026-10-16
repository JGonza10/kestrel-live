import { describe, expect, it } from 'vitest'
import { encodeStage, guestLink, isGuest, isHost, parseStage } from './stageSync.js'

const state = {
  layout: 'duo',
  ids: ['host-1:camera', 'guest-0123456789ab:camera'],
  style: { theme: 'classic', color: '#1f3a4d', showNames: true, showLogo: false },
  banner: 'Bienvenidos'
}
const raw = (obj) => new TextEncoder().encode(JSON.stringify(obj))

describe('parseStage', () => {
  it('lee lo que manda el anfitrión', () => {
    expect(parseStage(encodeStage(state), 'host-1')).toEqual(state)
  })

  it('ignora mensajes que no vienen del anfitrión', () => {
    expect(parseStage(encodeStage(state), 'guest-0123456789ab')).toBeNull()
    expect(parseStage(encodeStage(state), undefined)).toBeNull()
  })

  it('rechaza basura, JSON roto y diseños desconocidos', () => {
    expect(parseStage(new TextEncoder().encode('{no es json'), 'host-1')).toBeNull()
    expect(parseStage(raw({ v: 1, layout: 'hack', ids: [] }), 'host-1')).toBeNull()
    expect(parseStage(raw({ v: 2, layout: 'duo', ids: [] }), 'host-1')).toBeNull()
    expect(parseStage('texto', 'host-1')).toBeNull()
    expect(parseStage(new Uint8Array(5000), 'host-1')).toBeNull()
  })

  it('limpia estilo, ids y banner peligrosos', () => {
    const out = parseStage(
      raw({
        v: 1,
        layout: 'grid',
        ids: ['a', 5, { x: 1 }, 'b'],
        style: { theme: '<script>', color: 'red;background:url(x)' },
        banner: 'x'.repeat(500)
      }),
      'host-1'
    )
    expect(out.ids).toEqual(['a', 'b'])
    expect(out.style).toEqual({ theme: 'bubble', color: '#a85a22', showNames: true, showLogo: true })
    expect(out.banner).toBeNull()
  })
})

describe('identidades y link', () => {
  it('distingue anfitrión e invitado', () => {
    expect(isHost('host-3')).toBe(true)
    expect(isGuest('guest-0123456789ab')).toBe(true)
    expect(isGuest('host-3')).toBe(false)
    expect(isGuest('guest-XYZ')).toBe(false)
  })

  it('arma el link de invitado', () => {
    expect(guestLink('http://localhost:5173', 'abc_DEF-123')).toBe('http://localhost:5173/invitado/abc_DEF-123')
  })
})
