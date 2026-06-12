// Local persistence for session progress. Reserved namespace from the spec;
// stored as { finished: { "<num>": true } } to leave room for future logger
// data (sets done, timer, notes) under the same key.
const KEY = 'liftinglog:logs'

type Store = { finished: Record<string, boolean> }

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    const obj = raw ? JSON.parse(raw) : null
    if (obj && typeof obj === 'object' && obj.finished && typeof obj.finished === 'object') {
      return { finished: obj.finished }
    }
  } catch { /* corrupt or unavailable — fall through to empty */ }
  return { finished: {} }
}

function write(store: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* ignore */ }
}

export function isFinished(num: number): boolean {
  return read().finished[String(num)] === true
}

export function setFinished(num: number, value: boolean): void {
  const store = read()
  if (value) store.finished[String(num)] = true
  else delete store.finished[String(num)]
  write(store)
}

export function toggleFinished(num: number): boolean {
  const next = !isFinished(num)
  setFinished(num, next)
  return next
}
