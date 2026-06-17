// Shared display-unit setting (kg/lb), persisted to localStorage; defaults to kg.
// Single source of truth for the History and home screens.
import type { Unit } from './logger-model'

export const UNIT_KEY = 'liftinglog:unit'

export const getUnit = (): Unit => {
  try { return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg' } catch { return 'kg' }
}

export const setUnit = (u: Unit): void => {
  try { localStorage.setItem(UNIT_KEY, u) } catch { /* ignore */ }
}
