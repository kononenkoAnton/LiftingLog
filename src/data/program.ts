import data from './program.json'
import type { Program, Session } from './types'
import { deriveFocus } from '../lib/focus'

const raw = data as Program

export const program: Program = {
  ...raw,
  sessions: raw.sessions.map((s) => ({
    ...s,
    focus: s.focus || deriveFocus(s.exercises),
  })),
}

export function getSession(num: number): Session | undefined {
  return program.sessions.find((s) => s.num === num)
}
