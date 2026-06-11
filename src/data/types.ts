export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'

export type Weight =
  | { kind: 'single'; kg: number }
  | { kind: 'range'; minKg: number; maxKg: number }
  | { kind: 'progression'; kg: number[] }
  | { kind: 'perSet'; steps: { kg: number; reps: number }[] }
  | { kind: 'qualitative'; level: 'light' | 'medium' | 'heavy' }
  | { kind: 'bodyweight' }

export interface Exercise {
  order: number
  nameEn: string
  nameRu: string
  descEn: string
  descRu: string
  equipment: Equipment
  perImplement?: boolean
  weight: Weight
  sets: number | null
  reps: string
  notesEn?: string
  notesRu?: string
}

export interface Session {
  num: number
  date: string
  dateLabel: string
  focus: string
  exercises: Exercise[]
}

export interface Program {
  title: string
  sessions: Session[]
}
