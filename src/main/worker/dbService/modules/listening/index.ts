import { getDB } from '../../db'
import type { ListeningCheckpoint } from '@common/types/listening'

const retention = 90 * 86400000
let lastPruned = 0

export const listeningSave = (value: ListeningCheckpoint) => {
  const now = Date.now()
  const track = value?.track
  if (!value || !/^[\da-z-]{1,100}$/i.test(value.sessionId) || !Number.isSafeInteger(value.revision) || value.revision < 1 ||
    !track || typeof track.id != 'string' || track.id.length > 500 || typeof track.name != 'string' || !track.name.trim() ||
    typeof track.singer != 'string' || !['tx', 'wy', 'bili', 'kw', 'kg', 'mg', 'local'].includes(track.source) ||
    ![value.startedAt, value.updatedAt, value.duration, value.listened, value.coverage].every(Number.isFinite) ||
    value.startedAt < now - retention || value.updatedAt < value.startedAt || value.updatedAt > now + 300000 ||
    value.duration < 0 || value.duration > 86400 || value.listened < 0 || value.listened > 86400 || value.coverage < 0 || value.coverage > 86400) return
  const db = getDB()
  db.prepare(`INSERT INTO listening_session (session_id, revision, updated_at, data) VALUES (@id, @revision, @time, @data)
    ON CONFLICT(session_id) DO UPDATE SET revision=excluded.revision, updated_at=excluded.updated_at, data=excluded.data
    WHERE excluded.revision > listening_session.revision`).run({
    id: value.sessionId,
    revision: value.revision,
    time: value.updatedAt,
    data: JSON.stringify({
      sessionId: value.sessionId,
      revision: value.revision,
      startedAt: value.startedAt,
      updatedAt: value.updatedAt,
      duration: value.duration,
      listened: value.listened,
      coverage: value.coverage,
      track: { id: track.id, source: track.source, name: track.name.slice(0, 120), singer: track.singer.slice(0, 120) },
      completed: value.duration > 0 && value.coverage / value.duration >= 0.9,
      skipped: value.skipped === true,
    }),
  })
  if (now - lastPruned > 3600000) {
    db.prepare('DELETE FROM listening_session WHERE updated_at < ? OR session_id IN (SELECT session_id FROM listening_session ORDER BY updated_at DESC LIMIT -1 OFFSET 5000)').run(now - retention)
    lastPruned = now
  }
}

export const listeningGet = (): ListeningCheckpoint[] => {
  return (getDB().prepare('SELECT data FROM listening_session WHERE updated_at >= ? ORDER BY updated_at DESC LIMIT 5000').all(Date.now() - retention) as Array<{ data: string }>).flatMap(row => {
    try { return [JSON.parse(row.data) as ListeningCheckpoint] } catch { return [] }
  })
}
