import { describe, expect, it } from 'vitest'
import { ALL_TILES, topTiles } from './personalize'

const used = (...tiles: string[]) => tiles.map((tile) => ({ tile }))

describe('topTiles', () => {
  it('defaults to the most common needs', () => {
    expect(topTiles(undefined, []).top).toEqual(['water', 'pillow', 'bathroom'])
  })

  it('clinical notes come first, in order', () => {
    expect(topTiles({ priority_tiles: ['bathroom', 'medication'], npo: false }, []).top).toEqual(['bathroom', 'medication', 'water'])
  })

  it('what the patient actually uses rises over time', () => {
    const profile = { priority_tiles: ['bathroom'], npo: false }
    // One use joins the top 3 but doesn't outrank a clinical note; repeated use does.
    expect(topTiles(profile, used('tv')).top).toEqual(['bathroom', 'tv', 'water'])
    expect(topTiles(profile, used('tv', 'tv', 'tv', 'tv', 'tv')).top[0]).toBe('tv')
    expect(topTiles(profile, used(null as unknown as string)).top).toEqual(['bathroom', 'water', 'pillow'])
  })

  it('NPO patients never get food or drink in the top list', () => {
    const { top, rest } = topTiles({ priority_tiles: [], npo: true }, used('water', 'water'))
    expect(top).toEqual(['pillow', 'bathroom', 'blanket'])
    expect(rest).toContain('water')
  })

  it('top + rest cover every tile once', () => {
    const { top, rest } = topTiles({ priority_tiles: ['spiritual'], npo: false }, [])
    expect([...top, ...rest].sort()).toEqual([...ALL_TILES].sort())
  })
})

describe('iconFor (bathroom follows gender)', async () => {
  const { iconFor } = await import('../components/tileIcons')
  it.each([
    ['female', 'bathroom-female'],
    ['male', 'bathroom-male'],
    ['unspecified', 'bathroom'],
  ] as const)('%s → %s', (gender, icon) => {
    expect(iconFor('bathroom', gender)).toBe(icon)
    expect(iconFor('pillow', gender)).toBe('pillow')
  })
})
