const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { DatabaseSync } = require('node:sqlite')
const { EventEmitter } = require('node:events')
const ts = require('typescript')
const vue = require('vue')

function load(file, mocks = {}, globals = {}, source) {
  const module = { exports: {} }
  const output = ts.transpileModule(source ?? fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, console, require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error('Unmocked: ' + name) }, ...globals }, { filename: file })
  return module.exports
}
const library = load('src/common/types/library.ts')
const lru = load('src/common/utils/lruCache.ts')
const common = { arrPush: (target, items) => target.push(...items), arrUnshift: (target, items) => target.unshift(...items) }
const tick = () => new Promise(resolve => setImmediate(resolve))
const song = (id, extra = {}) => ({ id, source: 'tx', name: id, singer: 'Artist', interval: '03:00', meta: { songId: id, albumName: 'Album', picUrl: 'cover:' + id, qualitys: [], _qualitys: {}, ...extra } })
const clone = value => JSON.parse(JSON.stringify(value))

test('Sidebar and recommendation DB reads preserve ordering without warming the full playlist cache', () => {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE my_list_music_info (id TEXT, listId TEXT, name TEXT, singer TEXT, source TEXT, interval TEXT, meta TEXT); CREATE TABLE my_list_music_info_order (musicInfoId TEXT, listId TEXT, "order" INTEGER)')
  const insert = db.prepare('INSERT INTO my_list_music_info VALUES (?, ?, ?, ?, ?, ?, ?)')
  const order = db.prepare('INSERT INTO my_list_music_info_order VALUES (?, ?, ?)')
  const add = (listId, music, position) => {
    insert.run(music.id, listId, music.name, music.singer, music.source, music.interval, JSON.stringify(music.meta))
    order.run(music.id, listId, position)
  }
  add('large', song('later'), 9)
  add('large', { ...song('first', { bilibili: { matchedMusic: song('matched', { large: 'x'.repeat(10000) }) } }), source: 'bili' }, 0)
  add('other', { ...song('first'), name: 'Another playlist' }, 20)
  const statements = load('src/main/worker/dbService/modules/list/statements.ts', { '../../db': { getDB: () => db } })
  const helper = load('src/main/worker/dbService/modules/list/dbHelper.ts', { '../../db': { getDB: () => db }, './statements': statements })
  let fullReads = 0
  const worker = load('src/main/worker/dbService/modules/list/index.ts', {
    '@common/constants': { LIST_IDS: {} }, '@common/utils/common': common, '@common/types/library': library,
    './dbHelper': { ...helper, queryMusicInfoByListId(id) { fullReads++; return helper.queryMusicInfoByListId(id) } },
  })
  assert.equal(worker.getListMusicHead('large').id, 'first')
  assert.equal(worker.getListMusicHead('empty'), null)
  const compact = worker.getListMusicLibrary('large')
  assert.deepEqual(clone(compact), [
    { id: 'first', source: 'bili', name: 'first', singer: 'Artist', matched: { id: 'matched', name: 'matched', singer: 'Artist' } },
    { id: 'later', source: 'tx', name: 'later', singer: 'Artist' },
  ])
  assert.equal(fullReads, 0)
  assert.ok(JSON.stringify(compact).length < JSON.stringify(helper.queryMusicInfoByListId('large')).length / 10)
  db.prepare('UPDATE my_list_music_info SET name=? WHERE listId=? AND id=?').run('Updated', 'large', 'first')
  assert.equal(worker.getListMusicHead('large').name, 'Updated', 'Head reads must not create a permanent cache')
  assert.equal(worker.getListMusicLibrary('large')[0].name, 'Updated')
  const full = worker.getListMusics('large')
  full[0].name = 'Cached update'
  assert.equal(worker.getListMusicHead('large').name, 'Cached update')
  const projected = worker.getListMusicLibrary('large')
  assert.equal(projected[0].name, 'Cached update')
  assert.equal('meta' in projected[0], false)
  assert.notEqual(projected[0], full[0])
  assert.equal(fullReads, 1)
  db.close()
})

test('Lightweight renderer reads never populate the full playlist cache or retain nested metadata', async() => {
  const allMusicList = new Map()
  const events = { list_music_get_head: 'head', list_music_get_library: 'library', list_music_get: 'full' }
  const calls = []
  const subject = load('src/renderer/store/list/listManage/rendererListManage.ts', {
    '@common/utils/vueTools': vue, '@common/types/library': library, '@common/ipcNames': { PLAYER_EVENT_NAME: events },
    '@common/rendererIpc': { rendererInvoke: async(event, id) => { calls.push([event, id]); return event == 'head' ? song(id) : [library.toLibraryTrack(song(id))] } },
    './action': {}, './state': { allMusicList },
  })
  assert.equal((await subject.getListMusicHead('a')).id, 'a')
  assert.equal((await subject.getListMusicLibrary('a'))[0].id, 'a')
  assert.equal(allMusicList.size, 0)
  const music = song('b', { bilibili: { matchedMusic: song('matching') } })
  allMusicList.set('b', [music])
  assert.equal(await subject.getListMusicHead('b'), music)
  const compact = (await subject.getListMusicLibrary('b'))[0]
  assert.equal(compact.matched.id, 'matching')
  compact.matched.name = 'independent'
  assert.equal(music.meta.bilibili.matchedMusic.name, 'matching')
  assert.equal(calls.length, 2)
})

test('Unloaded playlist mutations still invalidate covers and recommendation exclusions', async() => {
  const allMusicList = new Map()
  const subject = load('src/renderer/store/list/listManage/action.ts', {
    '@common/utils/vueTools': { ...vue, markRawList: value => value },
    '@renderer/utils/data': {}, '@common/constants': { LIST_IDS: {} }, '@common/utils/common': common,
    './state': { allMusicList, defaultList: { id: 'default' }, loveList: { id: 'love' }, tempList: {}, userLists: [] },
  })
  assert.deepEqual(clone(subject.listMusicRemove('unloaded', ['track'])), ['unloaded'])
  assert.deepEqual(clone(subject.listMusicClear(['unloaded'])), ['unloaded'])
  assert.deepEqual(clone(subject.listMusicUpdateInfo([{ id: 'unloaded', musicInfo: song('track') }])), ['unloaded'])
  assert.deepEqual(clone(await subject.listMusicUpdatePosition('unloaded', 0, ['track'])), ['unloaded'])
  assert.equal(allMusicList.size, 0)
})

function coversHarness(initialIds, initialEnabled = true, headReader) {
  const events = new EventEmitter()
  const doc = new EventEmitter()
  doc.hidden = false
  doc.addEventListener = doc.on.bind(doc)
  doc.removeEventListener = doc.off.bind(doc)
  const ids = vue.ref(initialIds)
  const enabled = vue.ref(initialEnabled)
  const requests = []
  const pics = []
  const cleanup = []
  const scope = vue.effectScope()
  const useCovers = load('src/renderer/components/layout/Aside/usePlaylistCovers.ts', {
    '@common/utils/vueTools': { ...vue, onBeforeUnmount: fn => cleanup.push(fn) },
    '@renderer/store/list/listManage': { getListMusicHead: headReader ?? (id => new Promise(resolve => requests.push({ id, resolve }))) },
    '@renderer/core/music': { getPicPath: async({ musicInfo }) => { pics.push(musicInfo.id); return 'fetched:' + musicInfo.id } },
  }, { window: { app_event: events }, document: doc }).default
  const result = scope.run(() => useCovers(ids, enabled))
  return { ...result, ids, enabled, requests, pics, events, doc, dispose() { cleanup.forEach(fn => fn()); scope.stop() } }
}

test('Cover reads are bounded to two and pause while collapsed or hidden, without polling', async() => {
  const h = coversHarness(['a', 'b', 'c', 'd'], false)
  assert.equal(h.requests.length, 0)
  h.enabled.value = true
  await tick()
  assert.deepEqual(h.requests.map(item => item.id), ['a', 'b'])
  h.doc.hidden = true; h.doc.emit('visibilitychange')
  await tick()
  h.requests[0].resolve(song('a')); h.requests[1].resolve(song('b'))
  await tick()
  assert.equal(h.requests.length, 2)
  assert.equal(h.pics.length, 0)
  h.doc.hidden = false; h.doc.emit('visibilitychange')
  await tick()
  assert.equal(h.requests.length, 4)
  h.enabled.value = false
  await tick()
  h.requests[2].resolve(song('c')); h.requests[3].resolve(song('d'))
  await tick()
  assert.equal(h.requests.length, 4)
  h.dispose()
  assert.equal(h.events.listenerCount('myListUpdate'), 0)
  assert.equal(h.doc.listenerCount('visibilitychange'), 0)
})

test('Cover invalidations discard stale responses, retain hidden changes and clean up removed playlists', async() => {
  const h = coversHarness(['a'])
  h.events.emit('myListUpdate', ['a'])
  h.requests[0].resolve(song('old'))
  await tick()
  assert.equal(h.playlistCovers.a, undefined)
  assert.equal(h.requests.length, 2)
  h.requests[1].resolve(song('new'))
  await tick()
  assert.equal(h.playlistCovers.a, 'cover:new')
  h.enabled.value = false
  await tick()
  h.events.emit('myListUpdate', ['a'])
  assert.equal(h.requests.length, 2)
  h.enabled.value = true
  await tick()
  h.ids.value = []
  await tick()
  h.requests[2].resolve(song('removed'))
  await tick()
  assert.equal(h.playlistCovers.a, undefined)
  h.ids.value = ['a', 'b', 'c']
  await tick()
  h.dispose()
  const count = h.requests.length
  h.requests.slice(3).forEach(item => item.resolve(song('late')))
  await tick()
  assert.equal(h.requests.length, count)
  assert.equal(h.playlistCovers.a, undefined)
})

test('Changes elsewhere in a playlist do not repeatedly fetch the same first-song cover', async() => {
  const h = coversHarness(['a'], true, async() => song('first', { picUrl: '' }))
  await tick()
  assert.equal(h.playlistCovers.a, 'fetched:first')
  h.events.emit('myListUpdate', ['a'])
  await tick()
  assert.equal(h.pics.length, 1)
  h.dispose()
})

test('LRU limits page count and retained songs, updates recency, and never mutates visible data', () => {
  const cache = new lru.LruCache(3, 5, value => value.length)
  const visible = [1, 2]
  cache.set('a', visible).set('b', [3, 4])
  assert.equal(cache.get('a'), visible)
  cache.set('c', [5, 6])
  assert.equal(cache.has('b'), false)
  assert.equal(cache.has('a'), true)
  cache.set('a', [1, 2, 3, 4])
  assert.equal(cache.has('c'), false)
  cache.set('oversized', Array(6).fill(0))
  assert.equal(cache.has('oversized'), false)
  assert.deepEqual(visible, [1, 2])
  cache.clear()
  for (let i = 0; i < 1000; i++) cache.set(i, [])
  assert.equal(cache.size, 3)
  assert.equal(cache.get(997).length, 0)
})

test('Public playlist browsing evicts old pages and never reuses account recommendations', async() => {
  let reads = 0
  const state = { listDetailInfo: {}, tags: {}, listInfo: {}, selectListInfo: {}, isVisibleListDetail: {} }
  const action = load('src/renderer/store/songList/action.ts', {
    '@common/utils/lruCache': lru, '@common/utils/vueTools': { ...vue, markRawList: value => value },
    '@renderer/utils': { deduplicationList: value => value, toNewMusicInfo: value => value },
    '@renderer/utils/musicSdk': { default: { tx: { songList: { getListDetail: async(id) => { reads++; return { id, source: 'tx', list: [song(id)], total: 1, limit: 100 } } } } } },
    './state': state,
  }, { window: { i18n: { t: key => key } } })
  for (let i = 0; i < 30; i++) await action.getListDetail(String(i), 'tx', 1)
  await action.getListDetail('29', 'tx', 1)
  assert.equal(reads, 30)
  await action.getListDetail('0', 'tx', 1)
  assert.equal(reads, 31)
  await action.getListDetail('daily30', 'tx', 1)
  await action.getListDetail('daily30', 'tx', 1)
  assert.equal(reads, 33)
})

test('A failed old page request cannot erase the newly selected playlist or leaderboard', async() => {
  for (const kind of ['songList', 'leaderboard']) {
    let rejectOld
    const response = { source: 'tx', list: [song('new')], limit: 100, total: 1, info: {} }
    const request = id => id == 'old' ? new Promise((resolve, reject) => { rejectOld = reject }) : Promise.resolve(response)
    const state = { listDetailInfo: {}, tags: {}, boards: {}, listInfo: {}, selectListInfo: {}, isVisibleListDetail: {} }
    const action = load(`src/renderer/store/${kind}/action.ts`, {
      '@common/utils/lruCache': lru, '@common/utils/vueTools': { ...vue, markRawList: value => value },
      '@renderer/utils': { deduplicationList: value => value, toNewMusicInfo: value => value },
      '@renderer/utils/musicSdk': { default: { tx: { songList: { getListDetail: request }, leaderboard: { getList: request } } } },
      './state': state,
    }, { window: { i18n: { t: key => key } } })
    const old = kind == 'songList' ? action.getAndSetListDetail('old', 'tx', 1) : action.getAndSetListDetail('tx__old', 1)
    if (kind == 'songList') await action.getAndSetListDetail('new', 'tx', 1)
    else await action.getAndSetListDetail('tx__new', 1)
    rejectOld(new Error('old request failed'))
    await old
    assert.equal(state.listDetailInfo.list[0].id, 'new')
    assert.equal(state.listDetailInfo.noItemLabel, '')
  }
})

test('Visualizer has one animation loop, stops when hidden, and releases all listeners on unmount', () => {
  const file = 'src/renderer/components/common/AudioVisualizer.vue'
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
  const events = new EventEmitter()
  const doc = new EventEmitter()
  doc.hidden = false; doc.documentElement = {}
  doc.addEventListener = doc.on.bind(doc); doc.removeEventListener = doc.off.bind(doc)
  const win = new EventEmitter()
  win.app_event = events
  win.addEventListener = win.on.bind(win); win.removeEventListener = win.off.bind(win)
  const frames = new Map()
  let nextFrame = 0
  let samples = 0
  win.requestAnimationFrame = fn => { frames.set(++nextFrame, fn); return nextFrame }
  win.cancelAnimationFrame = id => frames.delete(id)
  const mounted = []; const cleanup = []
  const component = load(file, {
    '@common/utils/vueTools': { ...vue, onMounted: fn => mounted.push(fn), onBeforeUnmount: fn => cleanup.push(fn) },
    '@renderer/plugins/player': { getAnalyser: () => ({ frequencyBinCount: 128, getByteFrequencyData: data => { samples++; data.fill(10) } }) },
    '@renderer/store/player/state': { isPlay: vue.ref(true) },
  }, { window: win, document: doc, getComputedStyle: () => ({ getPropertyValue: () => '#fff' }) }, source).default
  const state = component.setup()
  state.dom_canvas.value = { clientWidth: 800, clientHeight: 400, getContext: () => ({ clearRect() {}, fillRect() {} }) }
  mounted.forEach(fn => fn())
  events.emit('play'); events.emit('play')
  assert.equal(frames.size, 1)
  assert.equal(samples, 1)
  doc.hidden = true; doc.emit('visibilitychange')
  assert.equal(frames.size, 0)
  events.emit('play')
  assert.equal(frames.size, 0)
  doc.hidden = false; doc.emit('visibilitychange')
  assert.equal(frames.size, 1)
  events.emit('stop')
  assert.equal(frames.size, 0)
  cleanup.forEach(fn => fn())
  assert.equal(events.eventNames().length, 0)
  assert.equal(doc.eventNames().length, 0)
  assert.equal(win.eventNames().length, 0)
})

test('Convolution presets discard late results, defer gains until ready and do not initialize audio when disabled', async() => {
  const settings = vue.reactive({
    'player.soundEffect.convolution.fileName': '',
    'player.soundEffect.convolution.mainGain': 10,
    'player.soundEffect.convolution.sendGain': 5,
    'player.soundEffect.pitchShifter.playbackRate': 1,
  })
  const requests = []
  class Request {
    open(method, url) { this.url = url }
    send() { requests.push(this) }
  }
  const applied = []; const gains = []; const cleanup = []
  const scope = vue.effectScope()
  const useEffects = load('src/renderer/core/useApp/usePlayer/useSoundEffect.ts', {
    '@common/utils/vueTools': { ...vue, onBeforeUnmount: fn => cleanup.push(fn) },
    '@common/utils/lruCache': lru, '@renderer/store/setting': { appSetting: settings },
    '@renderer/assets/medias/filters/a.wav': 'a', '@renderer/assets/medias/filters/b.wav': 'b',
    '@renderer/plugins/player': {
      freqs: [], setPannerSoundR() {}, setPannerSpeed() {}, setPitchShifter() {},
      getAudioContext: () => ({ decodeAudioData: (data, resolve) => { resolve(data); return Promise.resolve(data) } }),
      setConvolver: (...args) => applied.push(args), setConvolverMainGain: value => gains.push(value), setConvolverSendGain: value => gains.push(value),
    },
  }, { XMLHttpRequest: Request }).default
  scope.run(useEffects)
  assert.equal(applied.length, 0)
  assert.equal(requests.length, 0)
  settings['player.soundEffect.convolution.fileName'] = 'a.wav'
  await tick()
  settings['player.soundEffect.convolution.mainGain'] = 7
  settings['player.soundEffect.convolution.fileName'] = 'b.wav'
  await tick()
  assert.equal(gains.length, 0)
  requests[1].response = { id: 'b', length: 100, numberOfChannels: 2 }; requests[1].onload()
  await tick()
  assert.equal(applied[0][0].id, 'b')
  assert.equal(applied[0][1], 0.7)
  settings['player.soundEffect.convolution.fileName'] = ''
  await tick()
  assert.equal(applied[1][0], null)
  requests[0].response = { id: 'a', length: 100, numberOfChannels: 2 }; requests[0].onload()
  await tick()
  assert.equal(applied.length, 2, 'An old response must not re-enable a disabled effect')
  settings['player.soundEffect.convolution.fileName'] = 'b.wav'
  await tick()
  assert.equal(requests.length, 3, 'Disabling the effect releases the previously cached buffer')
  cleanup.forEach(fn => fn()); scope.stop()
  requests[2].response = { id: 'b', length: 100, numberOfChannels: 2 }; requests[2].onload()
  await tick()
  assert.equal(applied.length, 2)
})
