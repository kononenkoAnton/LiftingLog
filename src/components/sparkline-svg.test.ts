import { describe, it, expect } from 'vitest'
import { sparklineSvg } from './sparkline-svg'

// Pull the polyline's points back out as {x,y} pairs for assertions.
const polyPoints = (svg: string) => {
  const m = svg.match(/<polyline[^>]*points="([^"]*)"/)
  return m
    ? m[1].trim().split(/\s+/).map((p) => { const [x, y] = p.split(',').map(Number); return { x, y } })
    : []
}

describe('sparklineSvg', () => {
  it('returns an empty string when there is no data', () => {
    expect(sparklineSvg([])).toBe('')
  })

  it('draws a single dot and no line for one point', () => {
    const svg = sparklineSvg([100])
    expect(svg).toContain('spark-dot')
    expect(svg).not.toContain('<polyline')
  })

  it('plots one polyline point per value with strictly increasing x', () => {
    const p = polyPoints(sparklineSvg([1, 2, 3, 4]))
    expect(p).toHaveLength(4)
    for (let i = 1; i < p.length; i++) expect(p[i].x).toBeGreaterThan(p[i - 1].x)
  })

  it('normalizes so the max value sits highest (smallest y) and the min lowest', () => {
    const p = polyPoints(sparklineSvg([10, 30, 20, 40])) // max at idx 3, min at idx 0
    const ys = p.map((q) => q.y)
    expect(p[3].y).toBe(Math.min(...ys)) // 40 → top of the box
    expect(p[0].y).toBe(Math.max(...ys)) // 10 → bottom of the box
  })

  it('handles a flat line without dividing by zero (all points on one midline)', () => {
    const p = polyPoints(sparklineSvg([5, 5, 5]))
    expect(p).toHaveLength(3)
    p.forEach((q) => expect(Number.isFinite(q.y)).toBe(true))
    expect(new Set(p.map((q) => q.y)).size).toBe(1) // all equal
  })

  it('strokes with the provided accent color', () => {
    expect(sparklineSvg([1, 2, 3], { color: '#e3b341' })).toContain('#e3b341')
  })
})
