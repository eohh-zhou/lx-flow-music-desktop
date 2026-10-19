const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { DatabaseSync } = require('node:sqlite')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const ts = require('typescript')
const vue = require('vue')
const { EventEmitter } = require('node:events')

function load(file, mocks = {}, globals = {}) {
  const module = { exports: {} }
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, console, require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error('Unmocked: ' + name) }, ...globals })
  return module.exports
}
const local = (year, month, day, hour = 12, minute = 0, second = 0) => new Date(year, month - 1, day, hour, minute, second).getTime()
const tables = load('src/main/worker/dbService/tables.ts')
const types = load('src/common/types/listening.ts')
const base = 'src/main/worker/dbService/modules/listening/'
function database() {
  const db = new DatabaseSync(':memory:')
  db.transaction = fn => () => { db.exec('BEGIN'); try { const value = fn(); db.exec('COMMIT'); return value } catch (error) { db.exec('ROLLBACK'); throw error } }
  return db
}
function fixture(time = local(2026, 10, 19)) {
  const db = database()
  for (const [name, sql] of tables.default) if (name.includes('listening_')) db.exec(sql)
  let now = time
  let serial = 0
  class Clock extends Date { static now() { return now } }
  const reports = load(base + 'reports.ts', { '@common/types/listening': types }, { Date: Clock })
  const restart = () => load(base + 'index.ts', { '../../db': { getDB: () => db }, '@common/types/listening': types, './reports': reports }, { Date: Clock })
  const subject = restart()
  const entry = (overrides = {}) => ({ sessionId: 'listen-' + (++serial), revision: 1, track: { id: 'tx_song', source: 'tx', name: 'Song', singer: 'Artist' }, startedAt: now - 180000, updatedAt: now, duration: 180, listened: 180, coverage: 180, completed: true, skipped: false, ...overrides })
  return { db, subject, entry, restart, setTime: value => { now = value } }
}

test('Version 3 upgrades preserve playback history and playlists, and backfill once across restarts', () => {
  const db = database()
  for (const [name, sql] of tables.default) if (!['listening_rollup', 'listening_report', 'listening_state'].includes(name)) db.exec(sql)
  db.prepare('INSERT INTO db_info (field_name, field_value) VALUES (?, ?)').run('version', '3')
  db.prepare('INSERT INTO my_list (id, name, position) VALUES (?, ?, ?)').run('mine', 'Music', 0)
  const now = Date.now()
  const entry = { sessionId: 'legacy', revision: 3, track: { id: 'tx_old', source: 'tx', name: 'Existing', singer: 'Artist' }, startedAt: now - 180000, updatedAt: now, duration: 180, listened: 180, coverage: 180, completed: true, skipped: false }
  db.prepare('INSERT INTO listening_session VALUES (?, ?, ?, ?)').run(entry.sessionId, entry.revision, now, JSON.stringify(entry))
  const migrate = load('src/main/worker/dbService/migrate.ts', { './tables': tables }).default
  migrate(db); migrate(db)
  assert.equal(load('src/main/worker/dbService/verifyDB.ts', { './tables': tables }).default(db), true)
  const reports = load(base + 'reports.ts', { '@common/types/listening': types })
  const restart = () => load(base + 'index.ts', { '../../db': { getDB: () => db }, '@common/types/listening': types, './reports': reports })
  const period = types.listeningDate(now).slice(0, 7)
  assert.equal(restart().listeningReport(period).seconds, 180)
  assert.equal(restart().listeningReport(period).plays, 1)
  assert.equal(db.prepare('SELECT name FROM my_list').get().name, 'Music')
  db.close()
})

test('Repeated and out-of-order checkpoints replace contributions without inflating time or completion', () => {
  const { db, subject, entry } = fixture()
  const initial = entry({ listened: 20, coverage: 20 })
  subject.listeningSave(initial)
  subject.listeningSave({ ...initial, revision: 2, listened: 170, coverage: 170 })
  subject.listeningSave(initial)
  subject.listeningSave({ ...initial, revision: 2, listened: 999 })
  let report = subject.listeningReport('2026-10')
  assert.equal(report.seconds, 170)
  assert.equal(report.plays, 1)
  assert.equal(report.completed, 1)
  subject.listeningSave({ ...initial, revision: 3, listened: 100, coverage: 100 })
  report = subject.listeningReport('2026-10')
  assert.equal(report.seconds, 100)
  assert.equal(report.completed, 0)
  assert.equal(report.tracks[0].plays, 1)
  assert.equal(subject.listeningReport('2026').seconds, 100)
  db.close()
})

test('Midnight and year-end checkpoints stay in the session start period and update archived reports', () => {
  const f = fixture(local(2025, 12, 31, 23, 59, 55))
  const entry = f.entry({ startedAt: local(2025, 12, 31, 23, 59, 40), listened: 15, coverage: 15 })
  f.subject.listeningSave(entry)
  f.setTime(local(2026, 1, 1, 0, 3))
  assert.equal(f.subject.listeningReport('2025-12').archived, true)
  f.subject.listeningSave({ ...entry, revision: 2, listened: 180, coverage: 180, updatedAt: local(2026, 1, 1, 0, 3) })
  assert.equal(f.subject.listeningReport('2025-12').seconds, 180)
  assert.equal(f.subject.listeningReport('2025').seconds, 180)
  assert.equal(f.subject.listeningReport('2026').seconds, 0)
  assert.equal(f.subject.listeningReport('2025').tracks[0].plays, 1)
  f.db.close()
})

test('Annual totals and rankings survive raw-history pruning and are archived on the next launch', () => {
  const f = fixture(local(2025, 1, 1))
  let total = 0
  for (let month = 1; month <= 12; month++) {
    f.setTime(local(2025, month, 15))
    const item = f.entry({ listened: month * 60, coverage: 180 })
    total += item.listened
    f.subject.listeningSave(item)
    f.subject.listeningOverview()
  }
  f.setTime(local(2026, 1, 5))
  const restarted = f.restart()
  const overview = restarted.listeningOverview()
  const report = restarted.listeningReport('2025')
  assert.ok(overview.sessions < 12, 'Old session rows should have been pruned')
  assert.equal(report.seconds, total)
  assert.equal(report.plays, 12)
  assert.equal(report.uniqueTracks, 1)
  assert.equal(report.tracks[0].plays, 12)
  assert.equal(report.days.length, 12)
  assert.equal(report.archived, true)
  assert.equal(overview.periods.filter(value => value.length == 7).length, 12)
  f.setTime(local(2026, 5, 10))
  assert.equal(restarted.listeningReport('2025').seconds, total, 'Archived year survives removal of its rollup rows')
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM listening_rollup WHERE period = '2025'").get().count, 0)
  f.db.close()
})

test('Listening time is exact for short unqualified plays, skips and qualified short songs', () => {
  const f = fixture()
  f.subject.listeningSave(f.entry({ listened: 5, coverage: 5, skipped: true }))
  f.subject.listeningSave(f.entry({ listened: 9, coverage: 9, duration: 10 }))
  const report = f.subject.listeningReport('2026-10')
  assert.equal(report.seconds, 14)
  assert.equal(report.plays, 1)
  assert.equal(report.completed, 1)
  assert.equal(report.skipped, 1)
  assert.equal(report.uniqueTracks, 1)
  f.db.close()
})

test('Corrected artist metadata moves totals rather than leaving the uploader in artist rankings', () => {
  const f = fixture()
  const entry = f.entry()
  f.subject.listeningSave(entry)
  f.subject.listeningSave({ ...entry, revision: 2, track: { ...entry.track, singer: 'Singer A / Singer B', name: 'Corrected' } })
  const report = f.subject.listeningReport('2026-10')
  assert.equal(report.artists.length, 2)
  assert.equal(report.artists.some(item => item.name == 'Artist'), false)
  assert.equal(report.artists[0].plays, 1)
  assert.equal(report.tracks[0].track.name, 'Corrected')
  assert.equal(report.seconds, 180)
  f.db.close()
})

test('Preference ignore, restore and reset change recommendation history without deleting reports', () => {
  const f = fixture()
  const entry = f.entry()
  f.subject.listeningSave(entry)
  f.subject.listeningManage({ type: 'ignore', track: entry.track })
  assert.equal(f.subject.listeningGet().length, 0)
  assert.equal(f.subject.listeningReport('2026-10').plays, 1)
  f.subject.listeningManage({ type: 'restore', key: types.listeningTrackKey(entry.track) })
  assert.equal(f.subject.listeningGet().length, 1)
  f.subject.listeningManage({ type: 'personalize', value: false })
  assert.equal(f.subject.listeningGet().length, 0)
  assert.equal(f.subject.listeningReport('2026').plays, 1)
  f.subject.listeningManage({ type: 'personalize', value: true })
  f.subject.listeningManage({ type: 'resetPreferences' })
  assert.equal(f.subject.listeningGet().length, 0)
  f.setTime(local(2026, 10, 19, 13))
  f.subject.listeningSave(f.entry())
  assert.equal(f.subject.listeningGet().length, 1)
  assert.equal(f.subject.listeningReport('2026').plays, 2)
  f.db.close()
})

test('Disabled recording and clear reject queued old sessions, including after recording resumes', () => {
  const f = fixture()
  const old = f.entry()
  f.subject.listeningSave(old)
  f.subject.listeningManage({ type: 'recording', value: false })
  f.subject.listeningSave({ ...old, revision: 9, listened: 600 })
  assert.equal(f.subject.listeningReport('2026').seconds, 180)
  f.setTime(local(2026, 10, 19, 13))
  f.subject.listeningManage({ type: 'recording', value: true })
  f.subject.listeningSave({ ...old, revision: 10, updatedAt: local(2026, 10, 19, 13), listened: 600 })
  assert.equal(f.subject.listeningReport('2026').seconds, 180)
  f.subject.listeningManage({ type: 'clear' })
  f.subject.listeningSave({ ...old, revision: 11, updatedAt: local(2026, 10, 19, 13) })
  assert.equal(f.subject.listeningGet().length, 0)
  assert.equal(f.subject.listeningOverview().periods.length, 0)
  f.setTime(local(2026, 10, 19, 14))
  f.subject.listeningSave(f.entry())
  assert.equal(f.subject.listeningReport('2026').plays, 1)
  f.db.close()
})

test('Raw-history cap is enforced immediately and removed-session retries cannot inflate aggregates', () => {
  const f = fixture()
  let old
  for (let index = 0; index < 5002; index++) {
    const item = f.entry({ startedAt: local(2026, 10, 19) - (10000 - index) * 1000, updatedAt: local(2026, 10, 19) - (10000 - index) * 1000 + 500, listened: 0.5, coverage: 0.5 })
    old ??= item
    f.subject.listeningSave(item)
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM listening_session').get().count, 5000)
  f.subject.listeningSave({ ...old, revision: 9, updatedAt: local(2026, 10, 19), listened: 180 })
  assert.equal(f.subject.listeningReport('2026-10').seconds, 2501)
  f.db.close()
})

test('Calendar retention removes expired recaps even after years offline', () => {
  const f = fixture(local(2014, 10, 5))
  f.subject.listeningSave(f.entry())
  f.setTime(local(2026, 10, 5))
  f.subject.listeningOverview()
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM listening_report').get().count, 0)
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM listening_rollup').get().count, 0)
  f.db.close()
})

test('Ranking capacity is bounded while overall time and listens remain complete', () => {
  const f = fixture()
  f.subject.listeningOverview()
  const statement = f.db.prepare('INSERT INTO listening_rollup VALUES (?, ?, ?, ?)')
  f.db.transaction(() => {
    for (let index = 0; index < 3000; index++) statement.run('2026-10', 'track', 'tx:' + index, JSON.stringify({ seconds: 30, plays: 1, completed: 0, skipped: 0, track: { id: String(index), source: 'tx', name: 'Bounded', singer: '' } }))
  })()
  f.subject.listeningSave(f.entry())
  const report = f.subject.listeningReport('2026-10')
  assert.equal(report.limited, true)
  assert.equal(report.seconds, 180)
  assert.equal(report.plays, 1)
  assert.equal(f.db.prepare("SELECT COUNT(*) AS count FROM listening_rollup WHERE period = '2026-10' AND kind = 'track'").get().count, 3000)
  assert.equal(report.tracks.length, 20)
  f.db.close()
})

test('New journal stays empty, rejects invalid periods and stores no audio, cover or credentials', () => {
  const f = fixture()
  assert.equal(f.subject.listeningReport('2026-10').seconds, 0)
  assert.equal(f.subject.listeningOverview().periods.length, 0)
  for (const value of ['2026-00', '2026-13', '2027', '../2026']) assert.throws(() => f.subject.listeningReport(value))
  const item = f.entry()
  f.subject.listeningSave({ ...item, apiKey: 'private-key', track: { ...item.track, audioUrl: 'audio-address', pic: 'cover-image', name: 'Long'.repeat(100) } })
  const data = f.db.prepare('SELECT data FROM listening_rollup UNION ALL SELECT data FROM listening_session').all().map(row => row.data).join('')
  assert.equal(/private-key|audio-address|cover-image/.test(data), false)
  assert.equal(f.subject.listeningReport('2026').tracks[0].track.name.length, 120)
  f.db.close()
})

test('Unchanged buffering checkpoints update revision without rewriting aggregate rows', () => {
  const f = fixture()
  const entry = f.entry()
  f.subject.listeningSave(entry)
  f.db.exec('CREATE TABLE rollup_writes (count INTEGER); INSERT INTO rollup_writes VALUES (0); CREATE TRIGGER count_rollup_writes AFTER UPDATE ON listening_rollup BEGIN UPDATE rollup_writes SET count = count + 1; END;')
  f.subject.listeningSave({ ...entry, revision: 2, updatedAt: entry.updatedAt + 1000 })
  assert.equal(f.db.prepare('SELECT count FROM rollup_writes').get().count, 0)
  assert.equal(f.subject.listeningGet()[0].revision, 2)
  f.db.close()
})

test('Collapsing and restoring a list releases drag handlers and recreates them only for the current DOM', async() => {
  const list = vue.shallowRef(null)
  let unmount
  let active = 0
  const created = []
  const sortable = { mount() {}, create(element, options) {
    active++
    const item = { element, disabled: options.disabled, option(name, value) { this[name] = value }, destroy() { active-- } }
    created.push(item)
    return item
  } }
  const subject = load('src/renderer/utils/compositions/useDrag.js', {
    'sortablejs/modular/sortable.core.esm': { default: sortable, AutoScroll: class {} },
    '@common/utils/vueTools': { watch: vue.watch, onBeforeUnmount: fn => { unmount = fn } },
    '@renderer/event': { clearDownKeys() {} },
  }).default({ dom_list: list, onUpdate() {} })
  assert.equal(active, 0, 'An initially collapsed sidebar has no list DOM')
  for (let index = 0; index < 20; index++) {
    list.value = { id: index }
    await vue.nextTick()
    assert.equal(active, 1)
    subject.setDisabled(false)
    assert.equal(created.at(-1).disabled, false)
    list.value = null
    await vue.nextTick()
    assert.equal(active, 0)
    subject.setDisabled(true)
  }
  list.value = { id: 'last' }
  await vue.nextTick()
  assert.equal(created.at(-1).disabled, true)
  unmount()
  assert.equal(active, 0)
  list.value = { id: 'after-unmount' }
  await vue.nextTick()
  assert.equal(active, 0)
})

test('Player recording controls discard paused intervals and restart a cleared session without polling', async() => {
  const events = new EventEmitter()
  const controls = vue.reactive({ recording: true, recordingSince: 0 })
  const ready = vue.ref(true)
  const music = { id: 'tx_record', source: 'tx', name: 'Track', singer: 'Artist' }
  const { ListeningSession } = load('src/renderer/utils/recommendation/listening.ts')
  const saved = []
  const timers = new Map()
  let timerId = 0
  let position = 0
  let clock = 0
  let ticker
  let unmount
  const subject = load('src/renderer/core/useApp/usePlayer/useListeningHistory.ts', {
    '@common/utils/vueTools': { watch: vue.watch, onBeforeUnmount: fn => { unmount = fn } },
    '@renderer/plugins/player': { getCurrentTime: () => position, getDuration: () => 1000, getPlaybackRate: () => 1, onTimeupdate: fn => { ticker = fn; return () => { ticker = null } } },
    '@renderer/store/player/state': { playMusicInfo: { musicInfo: music }, isPlay: { value: true } },
    '@renderer/store/listening': { listeningReady: ready, listeningPreferences: controls, refreshListening: async() => {} },
    '@renderer/utils/recommendation/listening': { ListeningSession },
    '@renderer/utils/recommendation/listeningIpc': { saveListening: async value => { saved.push(value) } },
  }, {
    window: { app_event: events, addEventListener() {}, removeEventListener() {} }, performance: { now: () => clock },
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId }, clearTimeout: id => timers.delete(id),
  })
  const advance = seconds => { for (let index = 0; index < seconds; index++) { position++; clock += 1000; ticker() } }
  subject.default()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(timers.size, 1)
  assert.ok([...timers.values()][0].delay > 60000, 'The calendar timer is not a frequent polling loop')
  events.emit('playerPlaying'); advance(40)
  controls.recording = false
  await vue.nextTick()
  const countBefore = saved.length
  advance(90); events.emit('playerPause')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saved.length, countBefore)
  controls.recording = true
  controls.recordingSince = Date.now()
  await vue.nextTick()
  advance(45); events.emit('playerPause')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saved.at(-1).listened, 45)
  const oldId = saved.at(-1).sessionId
  controls.recordingSince++
  await vue.nextTick()
  advance(10); events.emit('playerPause')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(saved.at(-1).listened, 10)
  assert.notEqual(saved.at(-1).sessionId, oldId)
  unmount()
  assert.equal(timers.size, 0)
  assert.equal(events.eventNames().length, 0)
  assert.equal(ticker, null)
})
