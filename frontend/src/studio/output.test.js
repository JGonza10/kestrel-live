import { describe, expect, it } from 'vitest'
import { defaultStage, outputParams } from './output.js'

describe('outputParams', () => {
  it('lee url y token que pone Egress', () => {
    expect(outputParams('?url=ws%3A%2F%2Flivekit%3A7880&token=aaa.bbb.ccc&layout=')).toEqual({
      url: 'ws://livekit:7880',
      token: 'aaa.bbb.ccc'
    })
  })

  it('rechaza URLs que no son WebSocket o tokens raros', () => {
    expect(outputParams('?url=javascript:alert(1)&token=a.b.c')).toBeNull()
    expect(outputParams('?url=ws://x&token=<script>')).toBeNull()
    expect(outputParams('')).toBeNull()
  })
})

describe('defaultStage', () => {
  const cam = (id) => ({ id: `${id}:camera`, isScreen: false })
  it('sin lienzo del anfitrión: cámaras en cuadrícula, sin pantallas', () => {
    const st = defaultStage([cam('a'), { id: 'a:screen_share', isScreen: true }, cam('b')])
    expect(st.layout).toBe('grid')
    expect(st.ids).toEqual(['a:camera', 'b:camera'])
  })

  it('una sola persona: diseño Solo', () => {
    expect(defaultStage([cam('a')]).layout).toBe('solo')
  })
})
