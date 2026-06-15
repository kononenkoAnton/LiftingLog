import type { Equipment } from '../data/types'

export type WorkoutStatus = 'active' | 'finished' | 'cancelled'

/** One logged set. weightLb/reps are null until the user fills them in. */
export interface LoggedSet {
  weightLb: number | null
  reps: number | null
  done: boolean
  restSec: number
  note: string
}

export interface WorkoutExercise {
  exerciseRef: string        // catalog id, or `coach:<slug(nameEn)>` for prescribed lifts
  nameEn: string
  nameRu: string
  equipment: Equipment
  isCoachPrescribed: boolean
  coachTarget: string        // display string, e.g. "100 kg × 5"; '' when none
  sets: LoggedSet[]
}

export interface Workout {
  id: string
  sessionNum: number | null  // program day; null for an ad-hoc workout
  startedAt: string          // ISO timestamp
  endedAt: string | null
  pausedMs: number           // accumulated paused time, excluded from duration
  status: WorkoutStatus
  coachMessage: string
  exercises: WorkoutExercise[]
}
