import { getDB } from '../../db'
import { listeningDate, listeningTrackKey } from '@common/types/listening'
import type { ListeningCheckpoint, ListeningCommand, ListeningOverview, ListeningPreferences, ListeningReport, ListeningTrack } from '@common/types/listening'
import { aggregateListening, archiveListening, makeListeningReport } from './reports'

const retention = 90 * 86400000
interface State extends ListeningPreferences { prunedBefore: number }
let initialized = false
let lastMaintained = 0
let maintainedMonth = ''
const readState = (): State => JSON.parse((getDB().prepare('SELECT data FROM listening_state WHERE id = 1').get() as { data: string }).data)
const saveState = (state: State) => getDB().prepare('INSERT OR REPLACE INTO listening_state (id, data) VALUES (1, ?)').run(JSON.stringify(state))
const validTrack = (track: ListeningTrack) => track && typeof track.id == 'string' && track.id.length > 0 && track.id.length <= 500 &&
  typeof track.name == 'string' && !!track.name.trim() && typeof track.singer == 'string' && ['tx', 'wy', 'bili', 'kw', 'kg', 'mg', 'local'].includes(track.source)
const compactTrack = (track: ListeningTrack): ListeningTrack => ({ id: track.id, source: track.source, name: track.name.slice(0, 120), singer: track.singer.slice(0, 120) })
const parseEntry = (data: string): ListeningCheckpoint | undefined => {
  try {
    const entry = JSON.parse(data) as ListeningCheckpoint
    if (validTrack(entry.track) && [entry.startedAt, entry.updatedAt, entry.listened, entry.duration, entry.coverage].every(Number.isFinite)) return entry
  } catch { /* A damaged historical row must not prevent opening the library. */ }
}

const ensureInitialized = () => {
  if (initialized) return
  const db = getDB()
  db.transaction(() => {
    if (db.prepare('SELECT id FROM listening_state WHERE id = 1').get()) return
    const now = Date.now()
    const state: State = { recording: true, personalize: true, recordingSince: 0, preferenceSince: 0, startedAt: now, ignored: [], prunedBefore: 0 }
    const rows = db.prepare('SELECT data FROM listening_session WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT 5000').all(now - retention) as Array<{ data: string }>
    for (const row of rows) {
      const value = parseEntry(row.data)
      if (!value || value.startedAt < now - retention || value.startedAt > now || value.listened <= 0) continue
      state.startedAt = Math.min(state.startedAt, value.startedAt)
      aggregateListening(db, value)
    }
    saveState(state)
  })()
  initialized = true
}

const maintain = (now = Date.now(), force = false) => {
  const month = listeningDate(now).slice(0, 7)
  if (!force && month == maintainedMonth && now - lastMaintained < 3600000) return
  const db = getDB()
  db.transaction(() => {
    const state = readState()
    archiveListening(db, state.startedAt, now)
    // Remember the removed sessions' time floor so late retries cannot count twice.
    const remove = 'updated_at < ? OR session_id IN (SELECT session_id FROM listening_session ORDER BY updated_at DESC, session_id LIMIT -1 OFFSET 5000)'
    const floor = db.prepare("SELECT MAX(json_extract(data, '$.startedAt')) AS time FROM listening_session WHERE " + remove).get(now - retention) as { time: number | null }
    if (floor.time != null) {
      state.prunedBefore = Math.max(state.prunedBefore, floor.time)
      saveState(state)
      db.prepare('DELETE FROM listening_session WHERE ' + remove).run(now - retention)
    }
  })()
  maintainedMonth = month
  lastMaintained = now
}

export const listeningSave = (value: ListeningCheckpoint) => {
  const now = Date.now()
  if (!value || !/^[\da-z-]{1,100}$/i.test(value.sessionId) || !Number.isSafeInteger(value.revision) || value.revision < 1 || !validTrack(value.track) ||
    ![value.startedAt, value.updatedAt, value.duration, value.listened, value.coverage].every(Number.isFinite) ||
    value.startedAt < now - retention || value.updatedAt < value.startedAt || value.updatedAt > now + 300000 ||
    value.duration < 0 || value.duration > 86400 || value.listened < 0 || value.listened > 86400 || value.coverage < 0 || value.coverage > 86400) return
  ensureInitialized()
  const db = getDB()
  let prune = false
  db.transaction(() => {
    const state = readState()
    if (!state.recording || value.startedAt <= state.recordingSince) return
    const row = db.prepare('SELECT revision, data FROM listening_session WHERE session_id = ?').get(value.sessionId) as { revision: number, data: string } | undefined
    if (row && row.revision >= value.revision) return
    const previous = row ? parseEntry(row.data) : undefined
    if (!previous && value.startedAt <= state.prunedBefore) return
    if (previous && (previous.startedAt != value.startedAt || listeningTrackKey(previous.track) != listeningTrackKey(value.track))) return
    const entry: ListeningCheckpoint = {
      sessionId: value.sessionId,
      revision: value.revision,
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
      duration: value.duration,
      listened: value.listened,
      coverage: value.coverage,
      track: compactTrack(value.track),
      completed: value.duration > 0 && value.coverage / value.duration >= 0.9,
      skipped: value.skipped === true,
    }
    db.prepare('INSERT INTO listening_session (session_id, revision, updated_at, data) VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET revision = excluded.revision, updated_at = excluded.updated_at, data = excluded.data')
      .run(entry.sessionId, entry.revision, entry.updatedAt, JSON.stringify(entry))
    const changed = !previous || entry.listened != previous.listened || entry.coverage != previous.coverage || entry.duration != previous.duration || entry.completed != previous.completed || entry.skipped != previous.skipped || entry.track.name != previous.track.name || entry.track.singer != previous.track.singer
    if (changed && (entry.listened > 0 || previous)) aggregateListening(db, entry, previous)
    if (entry.startedAt < state.startedAt) { state.startedAt = entry.startedAt; saveState(state) }
    if (!row) prune = (db.prepare('SELECT COUNT(*) AS count FROM listening_session').get() as { count: number }).count > 5000
  })()
  maintain(now, prune || listeningDate(value.startedAt).slice(0, 7) != listeningDate(now).slice(0, 7))
}

// Recommendation callers receive only the history the user allows for learning.
export const listeningGet = (): ListeningCheckpoint[] => {
  ensureInitialized()
  maintain()
  const state = readState()
  if (!state.personalize) return []
  const ignored = new Set(state.ignored.map(listeningTrackKey))
  return (getDB().prepare('SELECT data FROM listening_session WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT 5000').all(Date.now() - retention) as Array<{ data: string }>).flatMap(row => {
    const value = parseEntry(row.data)
    return value && value.startedAt > state.preferenceSince && !ignored.has(listeningTrackKey(value.track)) ? [value] : []
  })
}

export const listeningOverview = (): ListeningOverview => {
  ensureInitialized()
  maintain(Date.now(), true)
  const db = getDB()
  const { prunedBefore, ...preferences } = readState()
  const periods = (db.prepare("SELECT period FROM listening_report UNION SELECT period FROM listening_rollup WHERE kind = 'total' ORDER BY period DESC").all() as Array<{ period: string }>).map(row => row.period)
  const storedBytes = (db.prepare('SELECT SUM(size) AS size FROM (SELECT SUM(length(CAST(data AS BLOB))) AS size FROM listening_session UNION ALL SELECT SUM(length(CAST(data AS BLOB))) FROM listening_rollup UNION ALL SELECT SUM(length(CAST(data AS BLOB))) FROM listening_report UNION ALL SELECT SUM(length(CAST(data AS BLOB))) FROM listening_state)').get() as { size: number }).size ?? 0
  const sessions = (db.prepare('SELECT COUNT(*) AS count FROM listening_session').get() as { count: number }).count
  return { preferences, periods, storedBytes, sessions }
}

export const listeningReport = (period: string): ListeningReport => {
  if (typeof period != 'string' || !/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(period) || period > listeningDate(Date.now()).slice(0, period.length)) throw new Error('Invalid listening period')
  ensureInitialized()
  maintain(Date.now(), true)
  const db = getDB()
  const saved = db.prepare('SELECT data FROM listening_report WHERE period = ?').get(period) as { data: string } | undefined
  return saved ? JSON.parse(saved.data) : makeListeningReport(db, period, readState().startedAt, Date.now())
}

export const listeningManage = (command: ListeningCommand): ListeningOverview => {
  ensureInitialized()
  const db = getDB()
  db.transaction(() => {
    const state = readState()
    const now = Date.now()
    switch (command?.type) {
      case 'recording':
        if (typeof command.value != 'boolean') throw new Error('Invalid recording preference')
        if (state.recording != command.value) { state.recording = command.value; state.recordingSince = now }
        break
      case 'personalize':
        if (typeof command.value != 'boolean') throw new Error('Invalid listening preference')
        state.personalize = command.value
        break
      case 'resetPreferences': state.preferenceSince = now; state.ignored = []; break
      case 'ignore':
        if (!validTrack(command.track)) throw new Error('Invalid preference track')
        if (!state.ignored.some(track => listeningTrackKey(track) == listeningTrackKey(command.track))) {
          if (state.ignored.length >= 100) throw new Error('Listening preference limit reached')
          state.ignored.push(compactTrack(command.track))
        }
        break
      case 'restore': state.ignored = state.ignored.filter(track => listeningTrackKey(track) != command.key); break
      case 'clear':
        db.exec('DELETE FROM listening_session; DELETE FROM listening_rollup; DELETE FROM listening_report;')
        state.startedAt = now
        state.recordingSince = now
        state.preferenceSince = now
        state.prunedBefore = now
        state.ignored = []
        break
      default: throw new Error('Invalid listening command')
    }
    saveState(state)
  })()
  return listeningOverview()
}
