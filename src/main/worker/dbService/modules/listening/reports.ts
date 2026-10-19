import type Database from 'better-sqlite3'
import { isQualifiedListen, listeningDate, listeningTrackKey } from '@common/types/listening'
import type { ListeningCheckpoint, ListeningReport, ListeningTotals, ListeningTrack } from '@common/types/listening'

interface Bucket extends ListeningTotals {
  track?: ListeningTrack
  name?: string
  firstAt?: number
  lastAt?: number
  limited?: boolean
}
const empty = (): ListeningTotals => ({ seconds: 0, plays: 0, completed: 0, skipped: 0 })
const metrics = (value?: ListeningCheckpoint): ListeningTotals => value ? {
  seconds: value.listened,
  plays: Number(isQualifiedListen(value)),
  completed: Number(value.completed && isQualifiedListen(value)),
  skipped: Number(value.skipped),
} : empty()
const artistNames = (value?: ListeningCheckpoint) => [...new Set((value?.track.singer ?? '').split(/[、,，/&]+/).map(name => name.trim()).filter(name => name && !/^(未知歌手|未知艺术家|unknown( artist)?)$/i.test(name)))].slice(0, 8)

// A revision replaces its previous contribution, inside the same DB transaction.
// Session-start attribution also keeps paused sessions and midnight retries stable.
export const aggregateListening = (db: Database.Database, value: ListeningCheckpoint, previous?: ListeningCheckpoint) => {
  const date = listeningDate(value.startedAt)
  const current = metrics(value)
  const before = metrics(previous)
  const delta = Object.fromEntries(Object.keys(current).map(key => [key, current[key as keyof ListeningTotals] - before[key as keyof ListeningTotals]])) as unknown as ListeningTotals
  const select = db.prepare('SELECT data FROM listening_rollup WHERE period = ? AND kind = ? AND item = ?')
  const write = db.prepare('INSERT INTO listening_rollup (period, kind, item, data) VALUES (?, ?, ?, ?) ON CONFLICT(period, kind, item) DO UPDATE SET data = excluded.data')
  for (const period of [date.slice(0, 7), date.slice(0, 4)]) {
    let limited = false
    const update = (kind: string, item: string, change: ListeningTotals, metadata: Partial<Bucket> = {}) => {
      let row = select.get(period, kind, item) as { data: string } | undefined
      if (!row && (kind == 'track' || kind == 'artist')) {
        const count = (db.prepare('SELECT COUNT(*) AS count FROM listening_rollup WHERE period = ? AND kind = ?').get(period, kind) as { count: number }).count
        const limit = (kind == 'track' ? 3000 : 1000) * (period.length == 4 ? 2 : 1)
        if (count >= limit) { limited = true; return }
      }
      const bucket: Bucket = row ? JSON.parse(row.data) : empty()
      for (const key of Object.keys(change) as Array<keyof ListeningTotals>) bucket[key] = Math.max(0, bucket[key] + change[key])
      Object.assign(bucket, metadata)
      write.run(period, kind, item, JSON.stringify(bucket))
    }
    update('track', listeningTrackKey(value.track), delta, { track: value.track })
    const oldArtists = new Map(artistNames(previous).map(name => [name.toLocaleLowerCase(), name]))
    const newArtists = new Map(artistNames(value).map(name => [name.toLocaleLowerCase(), name]))
    for (const [key, name] of oldArtists) {
      if (!newArtists.has(key)) update('artist', key, { seconds: -before.seconds, plays: -before.plays, completed: -before.completed, skipped: -before.skipped }, { name })
    }
    for (const [key, name] of newArtists) update('artist', key, oldArtists.has(key) ? delta : current, { name })
    update('day', date, delta)
    update('hour', String(new Date(value.startedAt).getHours()), delta)
    update('source', value.track.source, delta)
    const row = select.get(period, 'total', '') as { data: string } | undefined
    const total: Bucket = row ? JSON.parse(row.data) : empty()
    update('total', '', delta, {
      firstAt: Math.min(total.firstAt ?? value.startedAt, value.startedAt),
      lastAt: Math.max(total.lastAt ?? 0, value.updatedAt),
      limited: total.limited === true || limited,
    })
    // Only changed, completed periods need to be regenerated.
    db.prepare('DELETE FROM listening_report WHERE period = ?').run(period)
  }
}

export const makeListeningReport = (db: Database.Database, period: string, startedAt: number, now: number): ListeningReport => {
  const rows = db.prepare('SELECT kind, item, data FROM listening_rollup WHERE period = ?').all(period) as Array<{ kind: string, item: string, data: string }>
  const buckets = rows.map(row => ({ ...row, value: JSON.parse(row.data) as Bucket }))
  const total: Bucket = buckets.find(row => row.kind == 'total')?.value ?? empty()
  const days = buckets.filter(row => row.kind == 'day' && row.value.seconds > 0).map(row => ({ date: row.item, seconds: row.value.seconds })).sort((a, b) => a.date.localeCompare(b.date))
  let streak = 0
  let run = 0
  let last = 0
  for (const day of days) {
    const time = Date.parse(`${day.date}T00:00:00Z`)
    run = time - last == 86400000 ? run + 1 : 1
    streak = Math.max(streak, run)
    last = time
  }
  const tracks = buckets.filter(row => row.kind == 'track' && row.value.plays > 0)
  const order = (a: typeof buckets[number], b: typeof buckets[number]) => b.value.plays - a.value.plays || b.value.seconds - a.value.seconds || a.item.localeCompare(b.item)
  const current = listeningDate(now).slice(0, period.length)
  const start = new Date(Number(period.slice(0, 4)), period.length == 7 ? Number(period.slice(5)) - 1 : 0, 1).getTime()
  return {
    ...metrics(),
    ...total,
    period,
    generatedAt: now,
    archived: period < current,
    firstAt: total.firstAt ?? 0,
    lastAt: total.lastAt ?? 0,
    partial: startedAt > start,
    limited: !!total.limited,
    uniqueTracks: tracks.length,
    activeDays: days.length,
    streak,
    tracks: tracks.sort(order).slice(0, 20).map(({ value }) => ({ ...value, track: value.track! })),
    artists: buckets.filter(row => row.kind == 'artist' && row.value.plays > 0).sort(order).slice(0, 12).map(({ value }) => ({ ...value, name: value.name! })),
    days,
    hours: Array.from({ length: 24 }, (_, hour) => buckets.find(row => row.kind == 'hour' && row.item == String(hour))?.value.seconds ?? 0),
    sources: buckets.filter(row => row.kind == 'source' && row.value.seconds > 0).map(row => ({ source: row.item, seconds: row.value.seconds })).sort((a, b) => b.seconds - a.seconds),
  }
}

export const archiveListening = (db: Database.Database, startedAt: number, now: number) => {
  const date = listeningDate(now)
  const periods = db.prepare("SELECT DISTINCT period FROM listening_rollup WHERE kind = 'total' AND period NOT IN (SELECT period FROM listening_report)").all() as Array<{ period: string }>
  const insert = db.prepare('INSERT OR REPLACE INTO listening_report (period, data) VALUES (?, ?)')
  for (const { period } of periods) {
    if (period >= date.slice(0, period.length)) continue
    insert.run(period, JSON.stringify(makeListeningReport(db, period, startedAt, now)))
  }
  // Archive before pruning, even after the app has been closed for years.
  // Keep detailed aggregates for every period to which a retained session can belong.
  const floor = listeningDate(now - 90 * 86400000)
  db.prepare('DELETE FROM listening_rollup WHERE (length(period) = 7 AND period < ?) OR (length(period) = 4 AND period < ?)').run(floor.slice(0, 7), floor.slice(0, 4))
  const calendar = new Date(now)
  const monthFloor = listeningDate(new Date(calendar.getFullYear(), calendar.getMonth() - 36, 1).getTime()).slice(0, 7)
  db.prepare('DELETE FROM listening_report WHERE (length(period) = 7 AND period < ?) OR (length(period) = 4 AND period < ?)').run(monthFloor, String(calendar.getFullYear() - 10))
}
