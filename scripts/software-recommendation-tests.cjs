const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { EventEmitter } = require('node:events')
const { DatabaseSync } = require('node:sqlite')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const ts = require('typescript')
const vue = require('vue')

function load(file, mocks = {}, globals = {}, source) {
  const module = { exports: {} }
  const output = ts.transpileModule(source ?? fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, console, AbortController, setTimeout, clearTimeout, require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error('Unmocked: ' + name) }, ...globals }, { filename: file })
  return module.exports
}
const base = 'src/renderer/utils/recommendation/'
const ranking = load(base + 'ranking.ts')
const listeningTypes = load('src/common/types/listening.ts')
const { ListeningSession } = load(base + 'listening.ts')
const softwareProfile = load(base + 'softwareProfile.ts', { '@common/types/listening': listeningTypes, './ranking': ranking, '@common/types/library': load('src/common/types/library.ts') })
const { buildSoftwareProfile, buildOwnedTrackKeys } = softwareProfile
const song = (id, singer = 'Artist', name = id, source = 'tx') => ({ id: `${source}_${id}`, source, name, singer, interval: '03:00', meta: { songId: id, albumName: 'Album', qualitys: [], _qualitys: {}, ...(source == 'tx' ? { strMediaMid: 'media' } : {}) } })
const row = music => ({ music, reason: '', origin: 'search' })
const day = 86400000
const now = Date.now()
const checkpoint = (music, overrides = {}) => ({ sessionId: 'listen-' + Math.random().toString(36).slice(2), revision: 1, track: { id: music.id, source: music.source, name: music.name, singer: music.singer }, startedAt: now - 180000, updatedAt: now, duration: 180, listened: 180, coverage: 180, completed: true, skipped: false, ...overrides })
const tick = () => new Promise(resolve => setImmediate(resolve))
const advance = (session, start, end, clock = 0, rate = 1, duration = 180) => {
  session.update(start, duration, clock, rate)
  for (let position = start + rate; position <= end; position += rate) session.update(position, duration, clock += 1000, rate)
  return clock
}

test('Listening counts actual playback and unique coverage, with seek, pause, sleep and speed safeguards', () => {
  const session = new ListeningSession(song('1'), now)
  session.resume()
  let clock = advance(session, 0, 20)
  session.seek()
  clock = advance(session, 160, 180, clock)
  assert.equal(session.snapshot().listened, 40)
  assert.equal(session.snapshot().coverage, 40)
  assert.equal(session.snapshot().completed, false, 'Reaching the end by seeking is not completion')
  session.pause()
  session.update(180, 180, clock += 60000)
  assert.equal(session.snapshot().listened, 40)
  session.resume()
  session.update(0, 180, clock)
  session.update(120, 180, clock += 120000)
  assert.equal(session.snapshot().listened, 40, 'Sleep or a discontinuous update cannot create listening time')
  const fast = new ListeningSession(song('2'), now)
  fast.resume()
  advance(fast, 0, 180, 0, 2)
  assert.equal(fast.snapshot().listened, 90)
  assert.equal(fast.snapshot().completed, true)
})

test('Replaying one section cannot manufacture completion; short tracks can still qualify', () => {
  const session = new ListeningSession(song('1'), now)
  session.resume()
  let clock = 0
  for (let index = 0; index < 12; index++) { session.seek(); clock = advance(session, 0, 20, clock) }
  assert.equal(session.snapshot().listened, 240)
  assert.equal(session.snapshot().coverage, 20)
  assert.equal(session.snapshot().completed, false)
  const short = new ListeningSession(song('2'), now)
  short.resume()
  advance(short, 0, 9, 0, 1, 10)
  assert.equal(listeningTypes.isQualifiedListen(short.snapshot()), true)
})

test('Only an intentional early skip is negative, never a late switch or playback failure', () => {
  for (const [seconds, manual, expected] of [[5, true, true], [5, false, false], [100, true, false], [0, true, false]]) {
    const session = new ListeningSession(song('1'), now)
    session.resume(); advance(session, 0, seconds); session.finish(manual)
    assert.equal(session.snapshot().skipped, expected)
  }
})

test('Player integration persists one session across buffering, marks manual skips and cleans up listeners', async() => {
  const events = new EventEmitter()
  const listeners = new Map()
  const state = { musicInfo: song('1') }
  const saved = []
  let position = 0
  let clock = 0
  let timeUpdate
  let unmount
  const subject = load('src/renderer/core/useApp/usePlayer/useListeningHistory.ts', {
    '@common/utils/vueTools': { onBeforeUnmount: callback => { unmount = callback }, watch: () => () => {} },
    '@renderer/plugins/player': { getCurrentTime: () => position, getDuration: () => 180, getPlaybackRate: () => 1, onTimeupdate: callback => { timeUpdate = callback; return () => { timeUpdate = null } } },
    '@renderer/store/player/state': { playMusicInfo: state, isPlay: { value: false } },
    '@renderer/store/listening': { listeningReady: { value: true }, listeningPreferences: { recording: true, recordingSince: 0 }, refreshListening: async() => {} },
    '@renderer/utils/recommendation/listening': { ListeningSession },
    '@renderer/utils/recommendation/listeningIpc': { saveListening: async value => saved.push(value) },
  }, { window: { app_event: events, addEventListener: (name, cb) => listeners.set(name, cb), removeEventListener: name => listeners.delete(name) }, performance: { now: () => clock } })
  subject.default()
  events.emit('playerPlaying')
  for (let index = 0; index < 5; index++) { position++; clock += 1000; timeUpdate() }
  events.emit('playerWaiting')
  await tick()
  clock += 60000
  events.emit('playerPlaying')
  for (let index = 0; index < 5; index++) { position++; clock += 1000; timeUpdate() }
  events.emit('playerUserSkip')
  state.musicInfo = song('2')
  events.emit('musicToggled')
  await tick()
  assert.equal(saved.at(-1).listened, 10)
  assert.equal(saved.at(-1).skipped, true)
  assert.equal(new Set(saved.map(item => item.sessionId)).size, 1)
  unmount()
  assert.equal(events.eventNames().length, 0)
  assert.equal(listeners.size, 0)
  assert.equal(timeUpdate, null)
})

test('Database upgrade adds listening storage and preserves existing playlists and songs', () => {
  const tables = load('src/main/worker/dbService/tables.ts')
  const db = new DatabaseSync(':memory:')
  db.transaction = fn => (...args) => { db.exec('BEGIN'); try { const result = fn(...args); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error } }
  for (const [name, sql] of tables.default) if (!name.includes('listening_')) db.exec(sql)
  db.prepare('INSERT INTO db_info (field_name, field_value) VALUES (?, ?)').run('version', '2')
  db.prepare('INSERT INTO my_list (id, name, position) VALUES (?, ?, ?)').run('mine', 'My songs', 0)
  db.prepare('INSERT INTO my_list_music_info (id, listId, name, singer, source, meta) VALUES (?, ?, ?, ?, ?, ?)').run('tx_1', 'mine', 'Saved song', 'Artist', 'tx', '{}')
  const migrate = load('src/main/worker/dbService/migrate.ts', { './tables': tables }).default
  migrate(db)
  migrate(db)
  assert.equal(db.prepare('SELECT field_value FROM db_info WHERE field_name=?').get('version').field_value, '4')
  assert.equal(db.prepare('SELECT name FROM my_list').get().name, 'My songs')
  assert.equal(db.prepare('SELECT name FROM my_list_music_info').get().name, 'Saved song')
  const verify = load('src/main/worker/dbService/verifyDB.ts', { './tables': tables }).default
  assert.equal(verify(db), true)
  db.close()
})

test('Listening checkpoints are idempotent and store only bounded preference metadata', () => {
  const tables = load('src/main/worker/dbService/tables.ts')
  const db = new DatabaseSync(':memory:')
  db.transaction = fn => () => { db.exec('BEGIN'); try { const value = fn(); db.exec('COMMIT'); return value } catch (error) { db.exec('ROLLBACK'); throw error } }
  for (const [name, sql] of tables.default) if (name.includes('listening_')) db.exec(sql)
  const reports = load('src/main/worker/dbService/modules/listening/reports.ts', { '@common/types/listening': listeningTypes })
  const subject = load('src/main/worker/dbService/modules/listening/index.ts', { '../../db': { getDB: () => db }, '@common/types/listening': listeningTypes, './reports': reports })
  const value = checkpoint(song('1'), { apiKey: 'do-not-save', track: { ...song('1'), meta: { audioUrl: 'private' } } })
  subject.listeningSave(value)
  subject.listeningSave({ ...value, revision: 2, listened: 150, coverage: 150 })
  subject.listeningSave(value)
  assert.equal(subject.listeningGet().length, 1)
  assert.equal(subject.listeningGet()[0].listened, 150)
  assert.equal(subject.listeningGet()[0].completed, false)
  assert.equal(JSON.stringify(subject.listeningGet()).includes('audioUrl'), false)
  assert.equal(JSON.stringify(subject.listeningGet()).includes('apiKey'), false)
  subject.listeningSave({ ...value, sessionId: 'invalid', listened: Infinity })
  assert.equal(subject.listeningGet().length, 1)
  db.close()
})

test('Cold-start preferences use user playlists, deduplicate songs and sample beyond the beginning', () => {
  const first = song('1', 'A')
  const list = Array.from({ length: 1000 }, (_, index) => song(String(index), 'Artist' + index))
  const profile = buildSoftwareProfile([[first], [first], list], [], now)
  assert.equal(profile.qualified, 0)
  assert.equal(profile.recentWeight, 0)
  assert.equal(profile.seeds.filter(item => item.track.id == first.id).length, 1)
  assert.ok(profile.library.some(item => Number(item.id.split('_')[1]) > 900))
})

test('Recent completions and repeated listens outweigh a large playlist and older listens', () => {
  const recent = song('recent', 'Recent')
  const older = song('older', 'Older')
  const playlist = Array.from({ length: 100 }, (_, index) => song(String(index), 'Library'))
  const history = [checkpoint(recent), checkpoint(recent), checkpoint(older, { startedAt: now - 28 * day, updatedAt: now - 28 * day })]
  const profile = buildSoftwareProfile([playlist], history, now)
  assert.ok(profile.recentWeight > 0.5)
  assert.ok(profile.artists.get('recent').score > profile.artists.get('library').score)
  assert.ok(profile.artists.get('recent').score > profile.artists.get('older').score)
  assert.equal(profile.seeds[0].basis, 'repeat')
  assert.equal(profile.recent.has(recent.id), true)
})

test('Playback starts do not become repeats; looping and long recordings have bounded daily influence', () => {
  const favorite = song('favorite', 'Favorite')
  const starts = Array.from({ length: 20 }, () => checkpoint(favorite, { listened: 1, coverage: 1, completed: false }))
  assert.equal(buildSoftwareProfile([], starts, now).qualified, 0)
  const looping = buildSoftwareProfile([], Array.from({ length: 100 }, () => checkpoint(favorite)), now)
  const twice = buildSoftwareProfile([], [checkpoint(favorite), checkpoint(favorite)], now)
  assert.ok(looping.seeds[0].score <= twice.seeds[0].score * 2)
  assert.equal(looping.qualified, 3, 'The daily confidence contribution is bounded')
})

test('Profile scoring is independent of history order across days', () => {
  const favorite = song('favorite', 'Favorite')
  const other = song('other', 'Other')
  const history = [checkpoint(favorite), checkpoint(favorite, { startedAt: now - 20 * day, updatedAt: now - 20 * day }), checkpoint(other)]
  const first = buildSoftwareProfile([], history, now)
  const second = buildSoftwareProfile([], history.slice().reverse(), now)
  assert.equal(first.artists.get('favorite').score, second.artists.get('favorite').score)
})

const checkCancelled = signal => { if (signal.aborted) throw new Error('cancelled') }
const softwareRequests = load(base + 'softwareRequests.ts', { './providers': { checkCancelled } })
const softwareAssociations = load(base + 'softwareAssociations.ts', { './ranking': ranking, './softwareProfile': softwareProfile })
const softwareMmr = load(base + 'softwareMmr.ts', { './ranking': ranking, './softwareProfile': softwareProfile })
const engine = (search, catalogue = { searchPlaylistContexts: async() => [], getPlaylistContext: async() => { throw new Error('Unexpected context') } }) => load(base + 'softwareEngine.ts', {
  './ranking': ranking,
  './softwareProfile': softwareProfile,
  './providers': { checkCancelled, searchTracks: search },
  './softwareRequests': softwareRequests,
  './softwareAssociations': softwareAssociations,
  './softwareMmr': softwareMmr,
  './softwareCatalogue': catalogue,
})
const options = () => ({ source: 'all', blocked: new Set(), avoidRecent: false, variety: 'balanced', reason: (kind, name) => `${kind}:${name}`, signal: new AbortController().signal, allowed: () => true })

test('Software ranking respects recent behavior, skips, feedback and cross-platform deduplication', () => {
  const recent = song('recent', 'Recent')
  const bad = song('bad', 'Other')
  const blocked = song('blocked', 'Other')
  const profile = buildSoftwareProfile([[song('library', 'Library')]], [checkpoint(recent), checkpoint(bad, { listened: 5, coverage: 5, completed: false, skipped: true }), checkpoint(bad, { listened: 5, coverage: 5, completed: false, skipped: true })], now)
  const subject = engine(async() => [])
  const result = subject.rankSoftwareTracks([song('old', 'Library'), song('new', 'Recent', 'New'), song('123', 'Recent', 'New', 'wy'), bad, blocked].map(row), profile, { ...options(), blocked: new Set([blocked.id]) })
  assert.equal(result[0].music.id, 'tx_new')
  assert.equal(result.some(item => item.music.id == bad.id), false)
  assert.equal(result.some(item => item.music.id == blocked.id), false)
  assert.equal(result.filter(item => item.music.name == 'New').length, 1)
})

test('A large library cannot discard the recently preferred artist before personalized ranking', () => {
  const recent = song('recent', 'Recent')
  const profile = buildSoftwareProfile([[song('library', 'Library')]], [checkpoint(recent)], now)
  const rows = [...Array.from({ length: 300 }, (_, index) => song(String(index), 'Library')), song('new', 'Recent')].map(row)
  const result = engine(async() => []).rankSoftwareTracks(rows, profile, options())
  assert.equal(result[0].music.id, 'tx_new')
})

test('Software retrieval is bounded, uses only real track searches and never calls an AI or daily-feed provider', async() => {
  let active = 0
  let maximum = 0
  const calls = []
  const subject = engine(async(source, keyword) => {
    calls.push({ source, keyword }); active++; maximum = Math.max(maximum, active)
    await tick(); active--
    return [row(song(source == 'bili' ? 'BV17x411w7KC_1' : '123', keyword, 'Discovered', source))]
  })
  const profile = buildSoftwareProfile([[song('1', 'A'), song('2', 'B'), song('3', 'C')]], [], now)
  const result = await subject.generateSoftwareTracks(profile, options())
  assert.ok(calls.length <= 6)
  assert.equal(maximum, 2)
  assert.ok(result.pool.length > 0)
  assert.equal(result.partial, false)
})

test('Failed libraries never fall back to existing playlist songs and cancelled jobs cannot return stale candidates', async() => {
  const profile = buildSoftwareProfile([[song('1', 'A')]], [], now)
  const failed = await engine(async() => { throw new Error('offline') }).generateSoftwareTracks(profile, options())
  assert.equal(failed.pool.length, 0)
  assert.equal(failed.partial, true)
  const controller = new AbortController()
  const subject = engine(async() => { controller.abort(); return [row(song('2'))] })
  await assert.rejects(subject.generateSoftwareTracks(profile, { ...options(), signal: controller.signal }), /cancelled/)
})

test('Only newly searched tracks appear while later online searches are still running', async() => {
  const profile = buildSoftwareProfile([[song('1', 'A')]], [], now)
  let resolve
  const deferred = new Promise(_resolve => { resolve = _resolve })
  const shown = []
  const pending = engine(async(source) => { if (source != 'tx') await deferred; return [row(song(source == 'bili' ? 'BV17x411w7KC_1' : '2', 'A', 'New track', source))] }).generateSoftwareTracks(profile, { ...options(), onResults: rows => shown.push(rows) })
  await tick()
  assert.ok(shown.length >= 1)
  assert.equal(shown[0][0].music.id, 'tx_2')
  resolve()
  await pending
})

test('Reference exclusions affect taste but all visible playlists still exclude owned songs', async() => {
  const reads = []
  const subject = load(base + 'softwareData.ts', {
    '@renderer/store/list/listManage': { getListMusicLibrary: async id => { reads.push(id); return [song(id, id)] } },
    '@renderer/store/list/state': { userLists: [{ id: 'one' }, { id: 'two' }] },
    './listeningIpc': { getListening: async() => [] },
    './softwareProfile': softwareProfile,
    './providers': { checkCancelled },
  })
  await subject.getSoftwareProfile(null, new AbortController().signal)
  assert.deepEqual(reads, ['one', 'two'])
  reads.length = 0
  const profile = await subject.getSoftwareProfile(['two', 'love'], new AbortController().signal)
  assert.deepEqual(reads, ['one', 'two'])
  assert.equal(profile.seeds.length, 1)
  assert.equal(profile.seeds[0].track.id, 'tx_two')
  assert.equal(profile.owned.has('tx_one'), true)
})

test('Software and AI caches stay separate and compact metadata omits playback credentials', () => {
  const storage = new Map()
  const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  const session = load(base + 'session.ts', { '@common/utils/vueTools': vue, './ranking': ranking }, { localStorage })
  const subject = load(base + 'softwareSession.ts', { '@common/utils/vueTools': vue, './ranking': ranking, './session': session }, { localStorage })
  const track = song('1')
  track.meta.audioUrl = 'temporary-secret'
  subject.softwareFeeds.all.pool = [{ ...row(track), direction: 'artist:artist', reference: 'seed:song|artist', contexts: ['wy:123', 'invalid-context'] }]
  subject.softwareFeeds.all.generation = 7
  subject.softwareFeeds.all.ids = [track.id]
  assert.equal(subject.saveSoftwareRecommendations(), true)
  assert.equal(storage.has('lx__track_recommendations_v1'), false)
  assert.equal(storage.get('lx__software_recommendations_v5').includes('temporary-secret'), false)
  const restored = load(base + 'softwareSession.ts', { '@common/utils/vueTools': vue, './ranking': ranking, './session': session }, { localStorage })
  assert.equal(restored.softwareFeeds.all.ids[0], track.id)
  assert.equal(restored.softwareFeeds.all.pool[0].direction, 'artist:artist')
  assert.equal(restored.softwareFeeds.all.pool[0].reference, 'seed:song|artist')
  assert.deepEqual(Array.from(restored.softwareFeeds.all.pool[0].contexts), ['wy:123'])
  assert.equal(restored.softwareFeeds.all.generation, 7)
  assert.equal(restored.softwareFeeds.wy.pool.length, 0)
})

test('LX full-list cache preserves sixty selected IDs and expands old paginated caches', () => {
  const storage = new Map()
  const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  const session = load(base + 'session.ts', { '@common/utils/vueTools': vue, './ranking': ranking }, { localStorage })
  const restore = () => load(base + 'softwareSession.ts', { '@common/utils/vueTools': vue, './ranking': ranking, './session': session }, { localStorage })
  const subject = restore()
  const pool = Array.from({ length: 60 }, (_, index) => ({ ...row(song(String(index), 'Artist' + index)), reference: 'seed:reference' + Math.floor(index / 2) }))
  Object.assign(subject.softwareFeeds.all, { pool, ids: pool.map(row => row.music.id), generation: 12 })
  assert.ok(subject.saveSoftwareRecommendations())
  assert.equal(restore().softwareFeeds.all.ids.length, 60)
  const old = JSON.parse(storage.get('lx__software_recommendations_v5'))
  delete old.layoutVersion
  old.feeds.all.ids = old.feeds.all.ids.slice(0, 20)
  storage.set('lx__software_recommendations_v5', JSON.stringify(old))
  const migrated = restore()
  assert.equal(migrated.softwareFeeds.all.ids.length, 60)
  assert.equal(migrated.softwareFeeds.all.generation, 12)
  assert.equal(softwareMmr.selectSoftwareBatch(migrated.softwareFeeds.all.pool, { variety: 'balanced', limit: 60 }).length, 60)
})

test('Software view cancels outdated requests, keeps results on failure and plays its visible queue', async() => {
  const { parse, compileScript } = require('@vue/compiler-sfc')
  const file = 'src/renderer/views/Recommendations/SoftwareRecommendations.vue'
  const source = compileScript(parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).descriptor, { id: 'software-test' }).content
  const prefs = vue.reactive({ source: 'all', lists: null, avoidRecent: true, variety: 'balanced' })
  const feed = source => { const initial = row(song('1', 'Artist', 'Song', source)); return vue.reactive({ pool: [initial], ids: [initial.music.id], seen: [], updatedAt: 1 }) }
  const feeds = { all: feed('tx'), tx: feed('tx'), wy: feed('wy'), bili: feed('bili') }
  const pending = []
  const profiles = []
  const plays = []
  const queues = []
  const eventHub = new EventEmitter()
  let ownedLibrary = new Set()
  let unmount
  let resolveArtist
  const module = load(file, {
    '@renderer/store': { sourceNames: { value: { tx: 'Tencent', wy: 'NetEase', bili: 'bilibili' } } },
    vue,
    './RecommendationList.vue': {},
    '@common/utils/vueTools': { ...vue, onBeforeUnmount(callback) { unmount = callback } },
    '@renderer/plugins/i18n': { useI18n: () => key => key },
    '@renderer/store/list/state': { userLists: [{ id: 'one', name: 'Mine' }, { id: 'two', name: 'Also mine' }] },
    '@renderer/store/list/action': { setTempList: async(id, list) => queues.push({ id, list }) },
    '@common/constants': { LIST_IDS: { TEMP: 'temp' } },
    '@renderer/core/player/action': { playList: (id, index) => plays.push({ id, index }) },
    '@renderer/core/dislikeList': { hasDislike: () => false },
    '@renderer/utils/recommendation/session': { getBlockedKeys: () => new Set(), recommendationBlocked: [], saveRecommendations: () => true },
    '@renderer/utils/recommendation/softwareSession': { softwarePreferences: prefs, softwareFeeds: feeds, saveSoftwareRecommendations: () => true },
    '@renderer/utils/recommendation/softwareData': { getOwnedLibraryKeys: async() => ownedLibrary, getSoftwareProfile: (lists, signal) => { profiles.push({ lists, signal }); return Promise.resolve({ seeds: [{ track: song('seed') }], owned: new Set(), qualified: 1 }) } },
    '@renderer/utils/recommendation/softwareProfile': softwareProfile,
    '@renderer/utils/recommendation/softwareEngine': { generateSoftwareTracks: (_profile, options) => new Promise((resolve, reject) => pending.push({ options, resolve, reject })) },
    '@renderer/utils/recommendation/softwareMmr': softwareMmr,
    '@renderer/utils/recommendation/ranking': ranking,
    '@renderer/utils/recommendation/useVisibleArtists': { __esModule: true, default(_container, _rows, onResolved) { resolveArtist = onResolved } },
  }, { window: { app_event: eventHub } }, source)
  const scope = vue.effectScope()
  const state = scope.run(() => module.default.setup({}, { expose() {} }))
  state.toggleList('one')
  assert.deepEqual(Array.from(prefs.lists), ['two'])
  const first = state.run()
  await tick()
  prefs.source = 'wy'
  await vue.nextTick()
  assert.equal(pending[0].options.signal.aborted, true)
  pending[0].resolve({ pool: [row(song('2'))], partial: false })
  await first
  assert.equal(feeds.all.pool[0].music.id, 'tx_1')
  const second = state.run()
  await tick()
  pending[1].reject(new Error('offline'))
  await second
  assert.equal(feeds.wy.pool[0].music.id, 'wy_1')
  assert.equal(state.loading.value, false)
  await state.play(0)
  assert.equal(queues[0].list[0].id, 'wy_1')
  assert.deepEqual(plays, [{ id: 'temp', index: 0 }])
  assert.equal(profiles[0].lists[0], 'two')
  ownedLibrary = buildOwnedTrackKeys([[song('1', 'Artist', 'Song', 'wy')]])
  eventHub.emit('myListUpdate', ['one'])
  await tick()
  assert.equal(state.rows.value.length, 0, 'Adding a recommendation to a playlist removes it from the visible recommendations')
  const third = state.run()
  await tick()
  assert.equal(pending[2].options.rotation, 0, 'Failed and cancelled updates do not advance reference rotation')
  pending[2].resolve({ pool: [row(song('2', 'Artist', 'New song', 'wy'))], partial: false })
  await third
  assert.equal(feeds.wy.generation, 1)
  const fourth = state.run()
  await tick()
  assert.equal(pending[3].options.rotation, 1)
  assert.ok(pending[3].options.seen.has('wy_2'), 'Updating recommendations excludes songs already shown')
  state.cancel()
  pending[3].resolve({ pool: [row(song('3', 'Artist', 'Late song', 'wy'))], partial: false })
  await fourth
  assert.equal(feeds.wy.generation, 1)
  assert.equal(feeds.wy.pool[0].music.id, 'wy_2')
  const complete = state.run()
  await tick()
  const completePool = Array.from({ length: 45 }, (_, index) => ({ ...row(song(String(100 + index), 'Artist ' + index, 'New ' + index, 'wy')), reference: 'seed:' + Math.floor(index / 3) }))
  pending[4].resolve({ pool: completePool, partial: false })
  await complete
  assert.equal(state.rows.value.length, 30, 'All qualifying results display beyond the old 20-song page')
  assert.equal(feeds.wy.ids.length, 30)
  for (const reference of new Set(state.rows.value.map(row => row.reference))) assert.equal(state.rows.value.filter(row => row.reference == reference).length, 2, 'The full list retains the two-song reference cap')
  await state.play(29)
  assert.equal(queues[1].list.length, 30)
  assert.equal(plays[1].index, 29)
  feeds.wy.pool = []; feeds.wy.ids = []
  const preview = state.run()
  await tick()
  pending[5].options.onResults(completePool)
  assert.equal(state.rows.value.length, 30, 'Incremental results use the same full-list limits')
  assert.equal(feeds.wy.pool.length, 0, 'Unfinished generation does not overwrite persisted results')
  state.cancel()
  pending[5].resolve({ pool: completePool, partial: false })
  await preview
  assert.equal(state.rows.value.length, 0, 'Cancelled preview results do not survive as a completed feed')
  assert.equal(feeds.wy.pool.length, 0)
  prefs.source = 'bili'
  feeds.bili.pool = []; feeds.bili.ids = []
  await vue.nextTick()
  const biliPreview = state.run()
  await tick()
  const biliPool = [row(song('BV17x411w7KC_1', '', 'New Bilibili song', 'bili'))]
  pending[6].options.onResults(biliPool)
  resolveArtist({ ...biliPool[0].music, singer: 'Confirmed singer' })
  assert.equal(state.rows.value[0].music.singer, 'Confirmed singer', 'Visible preview receives artist matching')
  assert.equal(feeds.bili.pool.length, 0, 'Preview metadata does not create a completed feed')
  pending[6].options.onResults(biliPool)
  assert.equal(state.rows.value[0].music.singer, 'Confirmed singer', 'Later incremental results retain matched artists')
  pending[6].resolve({ pool: biliPool, partial: false })
  await biliPreview
  assert.equal(state.rows.value[0].music.singer, 'Confirmed singer')
  assert.equal(feeds.bili.pool[0].music.singer, 'Confirmed singer', 'Final results preserve preview metadata')
  unmount()
  assert.equal(eventHub.listenerCount('myListUpdate'), 0)
  scope.stop()
})

test('Owned songs are excluded across platforms and beyond the sampled playlist rows', () => {
  const saved = song('saved', 'Artist', 'Saved song')
  const unsampled = Array.from({ length: 1000 }, (_, index) => song(String(index), 'Artist', 'Track ' + index))
  const profile = buildSoftwareProfile([[saved], unsampled], [], now)
  const result = engine(async() => []).rankSoftwareTracks([
    saved, song('123', 'Artist', 'Saved song', 'wy'), song('999', 'Artist', 'Track 999'), song('outside', 'Artist', 'Outside'),
  ].map(row), profile, options())
  assert.deepEqual(Array.from(result, item => item.music.id), ['tx_outside'])
})

test('Uncertain artists and catalogue-matched Bilibili entries cannot reintroduce owned recordings', () => {
  const bili = song('BV17x411w7KC_1', '', 'Saved song', 'bili')
  bili.meta.bilibili = { matchedMusic: song('matched', 'Singer', 'Canonical song') }
  const keys = buildOwnedTrackKeys([[bili]])
  assert.equal(softwareProfile.isOwnedTrack(song('123', 'Singer', 'Saved song', 'wy'), keys), true)
  assert.equal(softwareProfile.isOwnedTrack(song('124', 'Singer', 'Canonical song', 'wy'), keys), true)
  assert.equal(softwareProfile.isOwnedTrack(song('125', 'Singer', 'Unrelated song', 'wy'), keys), false)
})

test('When the first search page is owned, retrieval searches the next page within the same budget', async() => {
  const saved = song('1', 'Artist', 'Saved')
  const profile = buildSoftwareProfile([[saved]], [], now)
  const calls = []
  const subject = engine(async(source, keyword, signal, page) => { calls.push(page); return [row(page == 1 ? saved : song('2', 'Artist', 'Outside'))] })
  const result = await subject.generateSoftwareTracks(profile, { ...options(), source: 'tx' })
  assert.deepEqual(calls, [1, 2])
  assert.deepEqual(Array.from(result.pool, row => row.music.id), ['tx_2'])
})

test('Old software caches are invalidated after the algorithm upgrade while preferences are retained', () => {
  for (const version of ['v1', 'v2', 'v3', 'v4']) {
    const storage = new Map([['lx__software_recommendations_' + version, JSON.stringify({ preferences: { source: 'wy', lists: ['mine'] }, feeds: { wy: { pool: [row(song('123', 'A', 'Owned', 'wy'))], ids: ['wy_123'] } } })]])
    const localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
    const session = load(base + 'session.ts', { '@common/utils/vueTools': vue, './ranking': ranking }, { localStorage })
    const subject = load(base + 'softwareSession.ts', { '@common/utils/vueTools': vue, './ranking': ranking, './session': session }, { localStorage })
    assert.equal(subject.softwarePreferences.source, 'wy')
    assert.deepEqual(Array.from(subject.softwarePreferences.lists), ['mine'])
    assert.equal(subject.softwareFeeds.wy.pool.length, 0)
    assert.equal(subject.softwareFeeds.wy.generation, 0)
  }
})

test('Short listening context follows the latest listening stint, not month-long totals or playback starts', () => {
  const old = song('old', 'Long-term')
  const current = song('current', 'Current')
  const history = [
    ...Array.from({ length: 8 }, (_, index) => checkpoint(old, { updatedAt: now - (index + 1) * day })),
    checkpoint(old, { updatedAt: now - 3 * 3600000 }),
    checkpoint(current, { updatedAt: now - 60000 }),
    checkpoint(song('start', 'Start'), { listened: 1, coverage: 1, completed: false, updatedAt: now }),
    checkpoint(song('skip', 'Skip'), { listened: 5, coverage: 5, completed: false, skipped: true }),
    checkpoint(song('future', 'Future'), { updatedAt: now + 60000 }),
  ]
  const profile = buildSoftwareProfile([[old]], history, now)
  assert.ok(profile.artists.get('longterm').score > profile.artists.get('current').score)
  assert.equal(profile.context.length, 1)
  assert.equal(profile.context[0].track.id, current.id)
  assert.equal(engine(async() => []).softwareQueries(profile, 'tx')[0].keyword, 'Current')
  const reversed = buildSoftwareProfile([[old]], history.slice().reverse(), now)
  assert.equal(reversed.context[0].track.id, current.id)
  const repeated = softwareProfile.buildListeningContext(Array.from({ length: 50 }, (_, index) => checkpoint(current, { updatedAt: now - index * 1000 })), now)
  assert.equal(repeated.length, 1)
  assert.ok(repeated[0].score < 1.5, 'Looping cannot manufacture unlimited short-term confidence')
  const stale = softwareProfile.buildListeningContext([checkpoint(current, { updatedAt: now - 20 * 3600000 })], now)
  assert.ok(stale[0].score < 0.04, 'An old listening stint retains absolute time decay')
})

test('Co-curated candidates require exact anchor overlap and can introduce a previously unknown artist', () => {
  const anchor = song('anchor', 'A', 'Seed')
  const profile = buildSoftwareProfile([[anchor]], [], now)
  const outside = song('2', 'B', 'Discovery', 'wy')
  const associations = softwareAssociations.buildSongAssociations([
    { id: 'valid', total: 2, tracks: [song('1', 'A', 'Seed', 'wy'), outside] },
    { id: 'cover', total: 2, tracks: [song('3', 'Cover artist', 'Seed', 'wy'), song('4', 'Unrelated', 'Unrelated', 'wy')] },
  ], profile)
  assert.ok(associations.get(outside.id).score > 0)
  assert.equal(associations.has('wy_4'), false, 'A matching playlist title or cover title provides no association')
  assert.equal(softwareAssociations.sameRecording({ name: 'Seed', singer: '' }, anchor), false)
  const ranked = engine(async() => []).rankSoftwareTracks([row(outside), row(anchor)], profile, { ...options(), associations })
  assert.deepEqual(Array.from(ranked, item => item.music.id), [outside.id])
  assert.equal(ranked[0].reason, 'related:Seed')
})

test('Playlist copies do not inflate association support, large playlists are downweighted and independent support helps', () => {
  const profile = buildSoftwareProfile([[song('anchor', 'A', 'Seed')]], [], now)
  const tracks = [song('1', 'A', 'Seed', 'wy'), song('2', 'B', 'Discovery', 'wy')]
  const first = { id: 'one', total: 2, tracks }
  const score = contexts => softwareAssociations.buildSongAssociations(contexts, profile).get('wy_2').score
  assert.equal(score([first]), score([first, { ...first, id: 'copy' }]))
  assert.ok(score([{ ...first, total: 10000 }]) < score([first]))
  assert.ok(score([first, { id: 'independent', total: 4, tracks: [...tracks, song('3', 'C', 'Third', 'wy'), song('4', 'D', 'Fourth', 'wy')] }]) > score([first]))
})

test('A large first-artist playlist cannot hide a second representative from association retrieval or validation', () => {
  const profile = buildSoftwareProfile([Array.from({ length: 110 }, (_, index) => song('a' + index, 'A', 'Song A' + index)), [song('b', 'B', 'Seed B')]], [], now)
  const seeds = softwareAssociations.associationSeeds(profile)
  assert.deepEqual(Array.from(seeds.slice(0, 2), seed => seed.track.singer), ['A', 'B'])
  assert.equal(seeds.filter(seed => seed.track.singer == 'A').length, 2, 'One artist cannot fill all reference slots')
  const associations = softwareAssociations.buildSongAssociations([{ id: 'second', total: 2, tracks: [song('1', 'B', 'Seed B', 'wy'), song('2', 'C', 'Discovery C', 'wy')] }], profile)
  assert.ok(associations.get('wy_2').score > 0)
})

test('MMR balances relevance against artist, album and version redundancy without grouping unknown metadata', () => {
  const candidate = (music, relevance) => ({ row: row(music), relevance, contexts: [] })
  const rows = [candidate(song('1', 'A', 'First'), 0.9), candidate(song('2', 'A', 'Second'), 0.88), candidate(song('3', 'A', 'Third'), 0.85), candidate(song('4', 'B', 'Fourth'), 0.7), candidate(song('5', 'C', 'Fifth'), 0.69)]
  const familiar = softwareMmr.rerankSoftwareMmr(rows, 'familiar', 3)
  const explore = softwareMmr.rerankSoftwareMmr(rows, 'explore', 3)
  assert.equal(explore[0].music.id, 'tx_1', 'Diversity does not displace the strongest first candidate')
  assert.ok(new Set(explore.map(item => item.music.singer)).size > new Set(familiar.map(item => item.music.singer)).size)
  assert.ok(softwareMmr.metadataSimilarity(candidate(song('6', 'A', 'First (Live)'), 1), rows[0]) >= 0.98)
  const albumOne = song('7', 'X'); albumOne.meta.albumId = 123
  const albumTwo = song('8', 'Y'); albumTwo.meta.albumId = 123
  assert.ok(softwareMmr.metadataSimilarity(candidate(albumOne, 1), candidate(albumTwo, 1)) >= 0.9)
  const unknownOne = song('9', ''); unknownOne.meta.albumId = 0
  const unknownTwo = song('10', ''); unknownTwo.meta.albumId = 0
  assert.equal(softwareMmr.metadataSimilarity(candidate(unknownOne, 1), candidate(unknownTwo, 1)), 0)
})

test('A dominant reference song cannot monopolize the first screen or later recommendation batches', () => {
  const candidates = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].flatMap((direction, index) => Array.from({ length: index ? 5 : 40 }, (_, offset) => ({
    row: row(song(direction + offset, `Artist ${direction}${offset}`, `Track ${direction}${offset}`)),
    relevance: index ? 0.62 : 0.95,
    contexts: [direction],
    directions: [{ key: 'seed:' + direction, weight: 1, reason: direction }],
  })))
  const pool = softwareMmr.rerankSoftwareMmr(candidates, 'balanced', 60)
  assert.equal(new Set(pool.slice(0, 4).map(item => item.direction)).size, 4, 'Different artists alone do not establish different reference songs')
  const first = softwareMmr.selectSoftwareBatch(pool, { variety: 'balanced' })
  assert.equal(first.length, 20)
  assert.ok(first.filter(item => item.direction == 'seed:A').length <= 2)
  const seen = new Set(first.flatMap(item => [item.music.id, ranking.trackSignature(item.music)]))
  const second = softwareMmr.selectSoftwareBatch(pool, { variety: 'balanced', seen })
  assert.ok(second.every(item => !seen.has(item.music.id)))
  assert.ok(second.filter(item => item.direction == 'seed:A').length <= 2)
  assert.equal(pool.length, 60, 'Surplus candidates remain available for another batch')
})

test('The two-song reference limit holds in every mode even when no alternative direction is available', () => {
  const pool = Array.from({ length: 30 }, (_, index) => ({ ...row(song(String(index), 'New artist ' + index)), direction: 'seed:one|artist' }))
  for (const variety of ['familiar', 'balanced', 'explore']) {
    const first = softwareMmr.selectSoftwareBatch(pool, { variety })
    assert.equal(first.length, 2)
    const seen = new Set(first.flatMap(item => [item.music.id, ranking.trackSignature(item.music)]))
    const next = softwareMmr.selectSoftwareBatch(pool, { variety, seen })
    assert.equal(next.length, 2)
    assert.ok(next.every(item => !seen.has(item.music.id)))
  }
})

test('Direct artist searches and co-curated results share the same two-song reference quota', () => {
  const reference = 'seed:one|artist'
  const pool = [
    ...Array.from({ length: 10 }, (_, index) => ({ ...row(song('direct' + index, 'Artist')), direction: 'artist:artist', reference })),
    ...Array.from({ length: 10 }, (_, index) => ({ ...row(song('related' + index, 'New' + index)), direction: reference, reference })),
    ...Array.from({ length: 4 }, (_, index) => ({ ...row(song('other' + index, 'Other' + index)), direction: 'seed:two|other' })),
  ]
  for (const variety of ['familiar', 'balanced', 'explore']) {
    const selected = softwareMmr.selectSoftwareBatch(pool, { variety })
    assert.equal(selected.filter(item => item.reference == reference).length, 2)
    assert.equal(selected.length, 4)
  }
})

test('Relabeling several genuine anchors cannot bypass the shared public-playlist quota', () => {
  const shared = Array.from({ length: 20 }, (_, index) => ({ ...row(song('shared' + index, 'Shared Artist ' + index)), direction: 'seed:anchor' + (index % 10), contexts: ['wy:123'] }))
  const independent = Array.from({ length: 4 }, (_, index) => ({ ...row(song('independent' + index, 'Independent ' + index)), direction: 'seed:independent' + index, contexts: ['wy:456'] }))
  const selected = softwareMmr.selectSoftwareBatch([...shared, ...independent], { variety: 'balanced' })
  assert.equal(selected.filter(item => item.contexts.includes('wy:123')).length, 5)
  assert.equal(selected.filter(item => item.contexts.includes('wy:456')).length, 4)
})

test('A weaker but valid preference is represented near the front of a dominant candidate pool', () => {
  const dominant = Array.from({ length: 80 }, (_, index) => ({ row: row(song('a' + index, 'A' + index)), relevance: 0.95, contexts: ['one'], directions: [{ key: 'seed:a', weight: 1, reason: 'A' }] }))
  const other = { row: row(song('b', 'B')), relevance: 0.18, contexts: ['two'], directions: [{ key: 'seed:b', weight: 1, reason: 'B' }] }
  const pool = softwareMmr.rerankSoftwareMmr([...dominant, other], 'balanced', 60)
  assert.ok(pool.slice(0, 4).some(item => item.music.id == 'tx_b'))
})

test('Updating rotates genuine references while retaining one current listening direction', () => {
  const seeds = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(artist => song(artist, artist, 'Seed ' + artist))
  const profile = buildSoftwareProfile([seeds], [checkpoint(seeds[0])], now)
  const first = softwareAssociations.associationSeeds(profile, 4, 0)
  const second = softwareAssociations.associationSeeds(profile, 4, 1)
  assert.equal(first[0].track.singer, 'A')
  assert.equal(second[0].track.singer, 'A')
  assert.notDeepEqual(Array.from(first.slice(1), item => item.track.id), Array.from(second.slice(1), item => item.track.id))
  const queries = engine(async() => []).softwareQueries(profile, 'tx', 'balanced', 1)
  assert.equal(new Set(queries.map(item => item.keyword)).size, queries.length)
  assert.ok(queries.length <= 4)
  const library = Array.from({ length: 120 }, (_, index) => song('many' + index, 'Artist ' + index))
  const cold = buildSoftwareProfile([library, [song('last', 'Last Playlist Artist')]], [], now)
  assert.ok(softwareAssociations.associationSeeds(cold).some(item => item.track.singer == 'Last Playlist Artist'), 'Cold start samples across the full reference collection')
})

test('Low-support reference directions get a retrieval slot before one strong anchor consumes the resolution budget', () => {
  const seeds = ['A', 'B', 'C', 'D'].map(artist => song(artist, artist, 'Seed ' + artist))
  const profile = buildSoftwareProfile([seeds], [checkpoint(seeds[0])], now)
  const contexts = seeds.map((seed, index) => ({
    id: String(index), total: index ? 1000 : 41,
    tracks: [song('anchor' + index, seed.singer, seed.name, 'wy'), ...Array.from({ length: index ? 1 : 40 }, (_, offset) => song(String(index * 1000 + offset), 'Discovery ' + index + ' ' + offset, 'New ' + index + ' ' + offset, 'wy'))],
  }))
  const associations = softwareAssociations.buildSongAssociations(contexts, profile)
  const selected = softwareAssociations.relatedCandidates(associations, music => !softwareProfile.isOwnedTrack(music, profile.owned), 6)
  assert.equal(new Set(selected.slice(0, 4).map(item => item.seed.track.singer)).size, 4)
})

test('A playlist found for another song must contain that requested recording before contributing candidates', async() => {
  const a = song('a', 'A', 'Seed A'); const b = song('b', 'B', 'Seed B')
  const profile = buildSoftwareProfile([[a, b]], [], now)
  const reads = []
  const contexts = {
    a: { id: 'a', total: 2, tracks: [song('1', 'A', 'Seed A', 'wy'), song('2', 'New A', 'New A', 'wy')] },
    wrong: { id: 'wrong', total: 2, tracks: [song('3', 'A', 'Seed A', 'wy'), song('4', 'Wrong direction', 'Wrong direction', 'wy')] },
    b: { id: 'b', total: 2, tracks: [song('5', 'B', 'Seed B', 'wy'), song('6', 'New B', 'New B', 'wy')] },
  }
  const catalogue = {
    searchPlaylistContexts: async keyword => keyword == 'Seed A' ? ['a'] : ['wrong', 'b'],
    getPlaylistContext: async id => { reads.push(id); return contexts[id] },
  }
  const result = await engine(async() => [], catalogue).generateSoftwareTracks(profile, { ...options(), source: 'wy' })
  assert.ok(reads.includes('b'), 'The second result for a missing reference remains eligible')
  assert.ok(result.pool.some(item => item.music.id == 'wy_2'))
  assert.ok(result.pool.some(item => item.music.id == 'wy_6'))
  assert.equal(result.pool.some(item => item.music.id == 'wy_4'), false, 'A playlist matching A cannot silently stand in for the search for B')
})

test('A shared playlist lookup is read once and validated separately for each requested reference', async() => {
  const a = song('a', 'A', 'Seed A'); const b = song('b', 'B', 'Seed B')
  const profile = buildSoftwareProfile([[b, a]], [], now)
  let reads = 0
  const catalogue = {
    searchPlaylistContexts: async() => ['123'],
    getPlaylistContext: async() => {
      reads++; await tick()
      return { id: 'wy:123', total: 2, tracks: [song('1', 'A', 'Seed A', 'wy'), song('2', 'New Artist', 'Discovery', 'wy')] }
    },
  }
  const result = await engine(async() => [], catalogue).generateSoftwareTracks(profile, { ...options(), source: 'wy' })
  assert.equal(reads, 1, 'Identical playlist IDs share one metadata request')
  assert.deepEqual(Array.from(result.pool, item => item.music.id), ['wy_2'], 'An earlier mismatch for B cannot discard the valid match for A')
})

test('A direct artist match retains its genuine profile basis even when the same song is also co-curated', () => {
  const a = song('a', 'A', 'Seed A'); const b = song('b', 'B', 'Seed B')
  const profile = buildSoftwareProfile([[a, b]], [checkpoint(b)], now)
  const outside = song('10', 'B', 'Discovery B', 'wy')
  const associations = softwareAssociations.buildSongAssociations([{ id: 'one', total: 2, tracks: [song('1', 'A', 'Seed A', 'wy'), outside] }], profile)
  const direct = { ...row(outside), direction: 'artist:b', reference: 'seed:seedb|b' }
  for (const rows of [[row(outside), direct], [direct, row(outside)]]) {
    const pool = engine(async() => []).rankSoftwareTracks(rows, profile, { ...options(), source: 'wy', associations })
    assert.equal(pool[0].direction, 'artist:b')
    assert.equal(pool[0].reason, 'context:B')
    assert.equal(pool[0].reference, 'seed:seedb|b')
    assert.equal(pool[0].contexts?.length ?? 0, 0)
  }
})

test('One public playlist cannot outweigh strong listening preference by reaching full association confidence', () => {
  const a = song('a', 'A', 'Seed A'); const b = song('b', 'B', 'Seed B')
  const profile = buildSoftwareProfile([[a, b]], [], now)
  profile.seeds.find(item => item.track.id == a.id).score = 1
  profile.artists.set('b', { name: 'B', score: 0.9, basis: 'repeat' })
  const associated = song('10', 'C', 'Co-curated', 'wy')
  const personal = song('11', 'B', 'Personal match', 'wy')
  const associations = softwareAssociations.buildSongAssociations([{ id: 'one', total: 2, tracks: [song('1', 'A', 'Seed A', 'wy'), associated] }], profile)
  const pool = engine(async() => []).rankSoftwareTracks([row(associated), row(personal)], profile, { ...options(), source: 'wy', associations })
  assert.equal(pool[0].music.id, personal.id)
  assert.ok(pool.some(item => item.music.id == associated.id), 'Weak association evidence remains useful without monopolizing ranking')
})

test('Alternative association explanations remain tied to actual shared playlist evidence', () => {
  const a = song('a', 'A', 'Seed A'); const b = song('b', 'B', 'Seed B')
  const profile = buildSoftwareProfile([[a, b]], [], now)
  const shared = song('10', 'Shared', 'Shared discovery', 'wy')
  const exclusive = song('11', 'Exclusive', 'Only A discovery', 'wy')
  const associations = softwareAssociations.buildSongAssociations([
    { id: 'a', total: 3, tracks: [song('1', 'A', 'Seed A', 'wy'), shared, exclusive] },
    { id: 'b', total: 2, tracks: [song('2', 'B', 'Seed B', 'wy'), shared] },
  ], profile)
  assert.equal(associations.get(shared.id).anchors.length, 2)
  assert.deepEqual(Array.from(associations.get(exclusive.id).anchors, item => item.seed.track.name), ['Seed A'])
  const result = engine(async() => []).rankSoftwareTracks([row(shared), row(exclusive)], profile, { ...options(), source: 'wy', associations })
  assert.equal(result.find(item => item.music.id == exclusive.id).reason, 'related:Seed A', 'Balancing cannot invent a second anchor for an exclusive relationship')
})

test('Four representative songs receive their own retrieval slots and cross-catalogue candidates', async() => {
  const seeds = ['A', 'B', 'C', 'D'].map(artist => song('seed' + artist, artist, 'Seed' + artist))
  const profile = buildSoftwareProfile([seeds], [], now)
  const searches = []; const contexts = []
  const discoveries = new Map()
  const catalogue = {
    searchPlaylistContexts: async keyword => { searches.push(keyword); return [keyword, keyword + '-second'] },
    getPlaylistContext: async id => {
      contexts.push(id)
      const seed = seeds.find(seed => seed.name == id)
      assert.ok(seed, 'The first pass gives each seed a slot before fetching second playlists')
      const tracks = Array.from({ length: 6 }, (_, index) => song(String(seed.singer.charCodeAt(0) * 100 + index), 'New' + seed.singer + index, 'Discovery' + seed.singer + index, 'wy'))
      for (const track of tracks) discoveries.set(`${track.name} ${track.singer}`, track)
      return { id, total: tracks.length + 1, tracks: [song(String(seed.singer.charCodeAt(0)), seed.singer, seed.name, 'wy'), ...tracks] }
    },
  }
  const result = await engine(async(source, keyword) => {
    const track = discoveries.get(keyword)
    return track ? [row(song('resolved' + track.meta.songId, track.singer, track.name, source))] : []
  }, catalogue).generateSoftwareTracks(profile, { ...options(), source: 'tx' })
  assert.deepEqual(searches.slice().sort(), ['SeedA', 'SeedB', 'SeedC', 'SeedD'])
  assert.equal(contexts.length, 4)
  assert.equal(result.pool.length, 6)
  assert.equal(new Set(result.pool.map(item => item.direction)).size, 4)
})

test('An owned first search page does not displace a second artist with another page from the first artist', async() => {
  const first = song('a', 'A'); const second = song('b', 'B')
  const profile = buildSoftwareProfile([[first, second]], [], now)
  const calls = []
  const result = await engine(async(source, keyword, signal, page) => {
    calls.push([keyword, page])
    return keyword == 'A' ? [row(first)] : [row(song('outside', 'B', 'Outside'))]
  }).generateSoftwareTracks(profile, { ...options(), source: 'tx' })
  assert.deepEqual(calls, [['A', 1], ['B', 1]])
  assert.equal(result.pool[0].music.id, 'tx_outside')
})

test('Association retrieval adds other artists and honors every owned playlist, explicit feedback and recent exclusions', async() => {
  const anchor = song('anchor', 'A', 'Seed')
  const owned = song('owned', 'B', 'Already saved')
  const heard = song('heard', 'C', 'Recently heard')
  const dismissed = song('5', 'E', 'Dismissed', 'wy')
  const profile = buildSoftwareProfile([[anchor]], [checkpoint(heard)], now, [[anchor], [owned]])
  const context = { id: 'one', total: 5, tracks: [song('1', 'A', 'Seed', 'wy'), song('2', 'New Artist', 'Discovery', 'wy'), song('3', 'B', 'Already saved', 'wy'), song('4', 'C', 'Recently heard', 'wy'), dismissed] }
  const catalogue = { searchPlaylistContexts: async() => ['one'], getPlaylistContext: async() => context }
  const result = await engine(async() => [], catalogue).generateSoftwareTracks(profile, { ...options(), source: 'wy', avoidRecent: true, blocked: new Set([dismissed.id]) })
  assert.deepEqual(Array.from(result.pool, item => item.music.id), ['wy_2'])
  assert.equal(result.pool[0].reason, 'related:Recently heard')
})

test('Related songs are resolved in the selected catalogue only after artist, title and duration checks', async() => {
  const profile = buildSoftwareProfile([[song('anchor', 'A', 'Seed')]], [], now)
  const catalogue = { searchPlaylistContexts: async() => ['one'], getPlaylistContext: async() => ({ id: 'one', total: 2, tracks: [song('1', 'A', 'Seed', 'wy'), song('2', 'B', 'Discovery', 'wy')] }) }
  for (const source of ['tx', 'bili']) {
    const ids = source == 'bili' ? ['BV17x411w7KC_1', 'BV1Q541167Qg_1', 'BV1xx411c7mD_1'] : ['cover', 'fragment', 'match']
    const result = await engine(async(platform, keyword) => {
      assert.equal(platform, source)
      if (keyword != 'Discovery B') return []
      const fragment = song(ids[1], 'B', 'Discovery', source); fragment.interval = '00:35'
      return [row(song(ids[0], 'Cover', 'Discovery', source)), row(fragment), row(song(ids[2], 'B', 'Discovery', source))]
    }, catalogue).generateSoftwareTracks(profile, { ...options(), source })
    assert.equal(result.pool.length, 1)
    assert.equal(result.pool[0].music.id, `${source}_${ids[2]}`)
    assert.equal(result.pool[0].reason, 'related:Seed')
  }
})

test('Unavailable association metadata keeps usable search results and reports a partial update', async() => {
  const profile = buildSoftwareProfile([[song('anchor', 'A', 'Seed')]], [], now)
  const catalogue = { searchPlaylistContexts: async() => { throw new Error('offline') }, getPlaylistContext: async() => { throw new Error('Must not run') } }
  const result = await engine(async() => [row(song('2', 'A', 'Outside', 'wy'))], catalogue).generateSoftwareTracks(profile, { ...options(), source: 'wy' })
  assert.equal(result.partial, true)
  assert.deepEqual(Array.from(result.pool, item => item.music.id), ['wy_2'])
})

test('Cancelling during a public playlist read prevents late associations and progress from being delivered', async() => {
  const profile = buildSoftwareProfile([[song('anchor', 'A', 'Seed')]], [], now)
  const controller = new AbortController()
  let finish
  const shown = []
  const catalogue = {
    searchPlaylistContexts: async() => ['one'],
    getPlaylistContext: async() => new Promise(resolve => { finish = () => resolve({ id: 'one', total: 2, tracks: [song('1', 'A', 'Seed', 'wy'), song('2', 'B', 'Outside', 'wy')] }) }),
  }
  const pending = engine(async() => [], catalogue).generateSoftwareTracks(profile, { ...options(), source: 'wy', signal: controller.signal, onResults: rows => shown.push(rows) })
  await tick(); controller.abort(); finish()
  await assert.rejects(pending, /cancelled/)
  assert.equal(shown.length, 0)
})

test('Exploration changes retrieval channels as well as ranking, while familiar mode retains artist searches', async() => {
  const profile = buildSoftwareProfile([[song('anchor', 'A', 'Seed')]], [], now)
  const outside = Array.from({ length: 12 }, (_, index) => song(String(index + 10), 'New' + index, 'Discovery' + index, 'wy'))
  const runs = []
  for (const variety of ['familiar', 'explore']) {
    const queries = []; const resolved = []
    const catalogue = {
      searchPlaylistContexts: async keyword => { queries.push(keyword); return ['one', 'two'] },
      getPlaylistContext: async id => ({ id, total: 7, tracks: [song('1', 'A', 'Seed', 'wy'), ...outside.slice(id == 'one' ? 0 : 6, id == 'one' ? 6 : 12)] }),
    }
    const result = await engine(async(source, keyword) => {
      const match = outside.find(music => keyword == `${music.name} ${music.singer}`)
      if (!match) return [row(song('familiar', 'A', 'Familiar'))]
      resolved.push(keyword)
      return [row(song('resolved' + match.meta.songId, match.singer, match.name))]
    }, catalogue).generateSoftwareTracks(profile, { ...options(), source: 'tx', variety })
    runs.push({ queries, resolved, result })
  }
  assert.equal(runs[0].queries[0], 'Seed A')
  assert.equal(runs[1].queries[0], 'Seed')
  assert.equal(runs[0].resolved.length, 2)
  assert.equal(runs[1].resolved.length, 8)
  assert.ok(runs[1].result.pool.filter(item => item.music.singer != 'A').length > runs[0].result.pool.filter(item => item.music.singer != 'A').length)
})

test('One request budget bounds concurrency, total work, deadlines and queued cancellation', async() => {
  let active = 0; let maximum = 0; let calls = 0
  const budget = new softwareRequests.SoftwareRequestBudget(new AbortController().signal, 3)
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => budget.run(async() => { calls++; active++; maximum = Math.max(maximum, active); await tick(); active--; return calls })))
  assert.equal(calls, 3)
  assert.equal(maximum, 2)
  assert.equal(results.filter(item => item.status == 'rejected' && item.reason instanceof softwareRequests.SoftwareBudgetExhausted).length, 9)
  budget.close()
  const expired = new softwareRequests.SoftwareRequestBudget(new AbortController().signal, 22, 0)
  await assert.rejects(expired.run(async() => { throw new Error('Must not start') }), softwareRequests.SoftwareBudgetExhausted)
  expired.close()
  const controller = new AbortController(); const finish = []
  const cancelled = new softwareRequests.SoftwareRequestBudget(controller.signal)
  const pending = Promise.allSettled(Array.from({ length: 8 }, () => cancelled.run(async() => { await new Promise(resolve => finish.push(resolve)); checkCancelled(controller.signal) })))
  controller.abort()
  finish.forEach(resolve => resolve())
  const cancelledResults = await pending
  assert.equal(cancelled.requests, 2)
  assert.equal(cancelledResults.every(item => item.status == 'rejected'), true)
  cancelled.close()
})

test('Catalogue reads and three-platform searches share the same bounded request queue', async() => {
  let active = 0; let maximum = 0
  const request = async work => { active++; maximum = Math.max(maximum, active); await tick(); const result = work(); active--; return result }
  const profile = buildSoftwareProfile([[song('anchorA', 'A', 'SeedA'), song('anchorB', 'B', 'SeedB')]], [], now)
  const catalogue = {
    searchPlaylistContexts: (keyword, budget) => budget.run(() => request(() => [keyword + '1', keyword + '2'])),
    getPlaylistContext: async(id, budget) => {
      await budget.run(() => request(() => null))
      return budget.run(() => request(() => ({ id, total: 20, tracks: [song('1', 'A', 'SeedA', 'wy'), ...Array.from({ length: 19 }, (_, index) => song(String(id.charCodeAt(id.length - 1) * 100 + index), id + 'New' + index, id + 'Discovery' + index, 'wy'))] })))
    },
  }
  const result = await engine((source, keyword) => request(() => [row(song(source == 'bili' ? 'BV17x411w7KC_1' : source == 'wy' ? '999' : 'new', keyword, 'New ' + keyword, source))]), catalogue).generateSoftwareTracks(profile, options())
  assert.equal(maximum, 2)
  assert.ok(result.requests <= 22)
  assert.ok(result.requests > 6, 'The check includes actual catalogue work rather than only legacy searches')
  assert.ok(result.pool.some(item => item.music.singer.includes('New')))
})

function catalogueHarness(fetchBody, extra = {}) {
  return load(base + 'softwareCatalogue.ts', {
    '@renderer/utils': { formatPlayTime: seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` },
    './providers': { checkCancelled, fetchBody },
  }, { URLSearchParams, ...extra })
}
const rawCatalogueSong = id => ({ id, name: 'Song ' + id, artists: [{ name: 'Artist ' + id }], album: { id, name: 'Album ' + id, picUrl: 'https://example.com/cover' }, duration: 180000, lMusic: { bitrate: 128000 }, audioUrl: 'private-audio', cookie: 'private-cookie' })

test('Anonymous playlist reads expand truncated details once, cap work and cache only canonical song metadata', async() => {
  const calls = []
  let clock = now
  const subject = catalogueHarness(async(url, options, signal, timeout) => {
    const parsed = new URL(url); calls.push({ parsed, options, timeout })
    if (parsed.pathname.includes('/search/')) return { code: 200, result: { playlists: [{ id: 123 }, { id: 123 }, { id: 'invalid' }] } }
    if (parsed.pathname.includes('/playlist/')) return { code: 200, playlist: { tracks: Array.from({ length: 10 }, (_, index) => rawCatalogueSong(index + 1)), trackIds: Array.from({ length: 120 }, (_, index) => ({ id: index + 1 })), trackCount: 120 } }
    return { code: 200, songs: Array.from({ length: 101 }, (_, index) => rawCatalogueSong(index + 1)) }
  }, { Date: class extends Date { static now() { return clock } } })
  const budget = new softwareRequests.SoftwareRequestBudget(new AbortController().signal)
  const signal = new AbortController().signal
  assert.deepEqual(Array.from(await subject.searchPlaylistContexts('Seed', budget, signal)), ['123'])
  const context = await subject.getPlaylistContext('123', budget, signal)
  assert.equal(context.tracks.length, 100)
  assert.equal(context.total, 120)
  assert.equal(ranking.isRecommendationTrack(context.tracks[0], 'wy'), true)
  assert.equal(context.tracks[0].interval, '03:00')
  assert.equal(context.tracks[0].meta.qualitys[0].type, '128k')
  assert.equal(JSON.stringify(context).includes('private-'), false)
  assert.equal(calls.length, 3)
  assert.equal(JSON.parse(calls[2].parsed.searchParams.get('ids')).length, 100)
  assert.ok(calls.every(call => call.parsed.hostname == 'music.163.com' && call.timeout == 8000 && !('Cookie' in call.options.headers)))
  await subject.getPlaylistContext('123', budget, signal)
  await subject.searchPlaylistContexts('Seed', budget, signal)
  assert.equal(calls.length, 3)
  clock += 6 * 3600000 + 1
  await subject.getPlaylistContext('123', budget, signal)
  assert.equal(calls.length, 5, 'Expired metadata is refreshed on demand')
  await assert.rejects(subject.getPlaylistContext('not-a-playlist', budget, signal), /recommend__error_search/)
  budget.close()
})

test('Catalogue cache capacity is bounded and aborted or failed reads cannot poison later updates', async() => {
  let calls = 0
  const subject = catalogueHarness(async() => { calls++; return { code: 200, playlist: { tracks: [rawCatalogueSong(1)], trackCount: 1 } } })
  const budget = new softwareRequests.SoftwareRequestBudget(new AbortController().signal)
  const signal = new AbortController().signal
  for (let id = 1; id <= 17; id++) await subject.getPlaylistContext(String(id), budget, signal)
  await subject.getPlaylistContext('17', budget, signal)
  assert.equal(calls, 17)
  await subject.getPlaylistContext('1', budget, signal)
  assert.equal(calls, 18, 'The seventeenth playlist evicts the oldest of sixteen cached playlists')
  budget.close()
  let finish; let reads = 0
  const controller = new AbortController()
  const late = catalogueHarness(async() => { reads++; if (reads == 1) await new Promise(resolve => { finish = resolve }); return { code: 200, playlist: { tracks: [rawCatalogueSong(1)] } } })
  const activeBudget = new softwareRequests.SoftwareRequestBudget(controller.signal)
  const pending = late.getPlaylistContext('1', activeBudget, controller.signal)
  await tick(); controller.abort(); finish()
  await assert.rejects(pending, /cancelled/)
  activeBudget.close()
  const nextBudget = new softwareRequests.SoftwareRequestBudget(signal)
  await late.getPlaylistContext('1', nextBudget, signal)
  assert.equal(reads, 2)
  nextBudget.close()
  let attempts = 0
  const unstable = catalogueHarness(async() => { if (++attempts == 1) throw new Error('offline'); return { code: 200, playlist: { tracks: [rawCatalogueSong(1)] } } })
  const retryBudget = new softwareRequests.SoftwareRequestBudget(signal)
  await assert.rejects(unstable.getPlaylistContext('1', retryBudget, signal), /offline/)
  assert.equal(attempts, 1, 'A failed read does not retry automatically')
  assert.equal((await unstable.getPlaylistContext('1', retryBudget, signal)).tracks.length, 1)
  assert.equal(attempts, 2, 'A later manual update can retry a failed read')
  retryBudget.close()
})
