import type { Exercise } from '../data/types'

const PRIMARY: { match: RegExp; label: string }[] = [
  { match: /bench/i, label: 'Bench' },
  { match: /deadlift/i, label: 'Deadlift' },
  { match: /squat/i, label: 'Squat' },
  { match: /good\s?morning|romanian|rdl|hinge/i, label: 'Hinge' },
  { match: /overhead|standing press|ohp/i, label: 'Press' },
  { match: /row|pulldown|pull-?up|chin/i, label: 'Pull' },
]

// The three main lifts shown as chips on the program list. Any present become
// chips (in order of first appearance); if none are present, ['ACCESSORY'].
const MAIN: { match: RegExp; tag: string }[] = [
  { match: /squat/i, tag: 'SQUAT' },
  { match: /bench/i, tag: 'BENCH' },
  { match: /deadlift/i, tag: 'DEADLIFT' },
]

export function liftTags(exercises: Exercise[]): string[] {
  const tags: string[] = []
  for (const e of exercises) {
    for (const m of MAIN) {
      if (m.match.test(e.nameEn) && !tags.includes(m.tag)) tags.push(m.tag)
    }
  }
  return tags.length ? tags : ['ACCESSORY']
}

export function deriveFocus(exercises: Exercise[]): string {
  const labels: string[] = []
  for (const e of exercises) {
    for (const p of PRIMARY) {
      if (p.match.test(e.nameEn) && !labels.includes(p.label)) {
        labels.push(p.label)
        break
      }
    }
    if (labels.length === 2) break
  }
  return labels.length ? labels.join(' + ') : 'Accessory'
}
