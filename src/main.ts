import './styles/theme.css'
import './styles/app.css'
import { route, startRouter } from './router'
import { renderList } from './screens/list'
import { renderSession, requestEnterLogger } from './screens/session'
import { mountActiveBar } from './components/active-bar'
import { renderLogin } from './screens/login'
import { renderExercises } from './screens/exercises'
import { renderHistory } from './screens/history'
import { renderProgress, renderProgressDetail } from './screens/progress'
import { renderExerciseHistory } from './screens/exercise-history'
import { loadProgress } from './lib/progress'
import { loadWorkouts } from './lib/workouts'
import { supabase } from './lib/supabase'

route('/', (el) => renderList(el))
route('/session/:n', (el, p) => renderSession(el, Number(p.n)))
route('/exercises', (el) => renderExercises(el))
route('/history', (el) => renderHistory(el))
route('/progress', (el) => renderProgress(el))
route('/progress/:lift', (el, p) => renderProgressDetail(el, p.lift))
route('/exercise/:ref', (el, p) => renderExerciseHistory(el, decodeURIComponent(p.ref)))

const app = document.querySelector<HTMLElement>('#app')!

// Start the app + the persistent "active workout" bar (tap → straight into the logger).
function launch() {
  startRouter(app)
  mountActiveBar(app, (n) => {
    requestEnterLogger()
    // Already on that day's route (e.g. its schedule) → re-render in place; else navigate.
    if (location.hash === `#/session/${n}`) renderSession(app, n)
    else location.hash = `#/session/${n}`
  })
}

async function boot() {
  // No backend configured → run locally (localStorage, no auth).
  if (!supabase) {
    await Promise.all([loadProgress(), loadWorkouts()])
    launch()
    return
  }
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    renderLogin(app) // login form; on success it reloads and boot() sees the session
    return
  }
  await Promise.all([loadProgress(), loadWorkouts()]) // hydrate the user's rows, then render the app
  launch()
}

boot()
