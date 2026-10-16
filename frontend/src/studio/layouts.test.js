import { describe, expect, it } from 'vitest'
import {
  SCENES, cleanBanner, composeStage, destSummary, egressLayout, formatClock, initials
} from './layouts.js'

const host = { id: 'host:camera', isLocal: true, isScreen: false }
const guestA = { id: 'a:camera', isLocal: false, isScreen: false }
const guestB = { id: 'b:camera', isLocal: false, isScreen: false }
const screen = { id: 'host:screen_share', isLocal: true, isScreen: true }

describe('composeStage', () => {
  it('sin nadie en escena regresa vacío', () => {
    expect(composeStage('duo', []).mode).toBe('empty')
  })

  it('Solo muestra únicamente a la primera fuente', () => {
    const c = composeStage('solo', [host, guestA])
    expect(c.tiles.map((t) => t.id)).toEqual(['host:camera'])
    expect(c.cols).toBe(1)
  })

  it('Dúo acomoda dos en columnas y descarta el tercero', () => {
    const c = composeStage('duo', [host, guestA, guestB])
    expect(c.tiles).toHaveLength(2)
    expect(c.cols).toBe(2)
  })

  it('Grupo con 3 personas usa 2 columnas y 2 filas', () => {
    const c = composeStage('grid', [host, guestA, guestB])
    expect([c.cols, c.rows]).toEqual([2, 2])
  })

  it('Pantalla grande pone la pantalla compartida como principal', () => {
    const c = composeStage('pres', [host, screen])
    expect(c.mode).toBe('pres')
    expect(c.main.id).toBe(screen.id)
    expect(c.side.map((s) => s.id)).toEqual([host.id])
  })

  it('Líder pone a una persona como principal aunque haya pantalla', () => {
    const c = composeStage('leader', [screen, guestA])
    expect(c.main.id).toBe(guestA.id)
  })

  it('Pantalla completa prefiere la pantalla compartida', () => {
    const c = composeStage('full', [host, screen])
    expect(c.tiles.map((t) => t.id)).toEqual([screen.id])
  })

  it('un diseño desconocido cae en Dúo', () => {
    expect(composeStage('nope', [host, guestA]).cols).toBe(2)
  })
})

describe('escenas', () => {
  const sources = [host, guestA, guestB, screen]
  const scene = (id) => SCENES.find((s) => s.id === id)

  it('Intro deja solo al anfitrión', () => {
    expect(scene('intro').pick(sources)).toEqual([host.id])
  })
  it('Conversación: anfitrión e invitado', () => {
    expect(scene('conv').pick(sources)).toEqual([host.id, guestA.id])
  })
  it('Panel: personas, sin la pantalla', () => {
    expect(scene('panel').pick(sources)).toEqual([host.id, guestA.id, guestB.id])
  })
  it('Demo: pantalla y anfitrión', () => {
    expect(scene('demo').pick(sources)).toEqual([screen.id, host.id])
  })
  it('Conversación sin invitados deja solo al anfitrión', () => {
    expect(scene('conv').pick([host])).toEqual([host.id])
  })
})

describe('utilidades', () => {
  it('traduce el diseño a la plantilla de LiveKit Egress', () => {
    expect(egressLayout('solo')).toBe('single-speaker')
    expect(egressLayout('pres')).toBe('speaker')
    expect(egressLayout('grid')).toBe('grid')
  })

  it('resume los destinos', () => {
    expect(destSummary('live', ['YouTube', 'Facebook', 'LinkedIn'])).toBe('Transmitir a YouTube, Facebook y LinkedIn')
    expect(destSummary('live', [])).toBe('Sin destinos elegidos')
    expect(destSummary('recording', ['YouTube'])).toMatch(/Grabación/)
  })

  it('formatea el reloj', () => {
    expect(formatClock(65)).toBe('01:05')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-3)).toBe('00:00')
  })

  it('saca iniciales', () => {
    expect(initials('Juan González Mendoza')).toBe('JG')
    expect(initials('')).toBe('?')
  })

  it('valida banners', () => {
    expect(cleanBanner('  Hola    mundo ')).toBe('Hola mundo')
    expect(cleanBanner('   ')).toBeNull()
    expect(cleanBanner('x'.repeat(121))).toBeNull()
  })
})
