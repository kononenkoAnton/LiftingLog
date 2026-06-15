import { describe, it, expect } from 'vitest'
import { program } from './program'

describe('program.json', () => {
  it('has the program sessions numbered contiguously from 1 (grows as the trainer adds days)', () => {
    expect(program.sessions.length).toBeGreaterThanOrEqual(55)
    program.sessions.forEach((s, i) => expect(s.num).toBe(i + 1))
  })
  it('every exercise has a valid equipment and weight kind', () => {
    const eq = new Set(['barbell','dumbbell','machine','cable','bodyweight'])
    for (const s of program.sessions)
      for (const e of s.exercises) {
        expect(eq.has(e.equipment)).toBe(true)
        expect(e.weight.kind).toBeTruthy()
      }
  })
})
