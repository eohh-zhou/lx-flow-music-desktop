const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const ts = require('typescript')

function load(file, mocks = {}, extra = {}, override) {
  const module = { exports: {} }
  const source = override ?? fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(output, { module, exports: module.exports, AbortController, setTimeout, clearTimeout, console, require(name) { if (Object.hasOwn(mocks, name)) return mocks[name]; throw new Error('Unmocked: ' + name) }, ...extra }, { filename: file })
  return module.exports
}
const base = 'src/renderer/utils/recommendation/'
const ranking = load(base + 'ranking.ts')
const listeningTypes = load('src/common/types/listening.ts')
const softwareProfile = load(base + 'softwareProfile.ts', { './ranking': ranking, '@common/types/listening': listeningTypes, '@common/types/library': load('src/common/types/library.ts') })
const softwareMmr = load(base + 'softwareMmr.ts', { './ranking': ranking, './softwareProfile': softwareProfile })
const aiRanking = load(base + 'aiRanking.ts', { './ranking': ranking, './softwareProfile': softwareProfile, './softwareMmr': softwareMmr })
const song = (id, singer = 'Artist', name = 'Song ' + id, source = 'tx', interval = '03:30') => ({
  id: `${source}_${id}`,
  source,
  name,
  singer,
  interval,
  meta: { songId: id, albumName: 'Album', picUrl: '', qualitys: [{ type: '128k', size: null }], _qualitys: { '128k': { size: null } }, ...(source == 'tx' ? { strMediaMid: 'media-' + id } : {}) },
})
const row = music => ({ music, reason: '', origin: 'search' })

test('Disabling a recommendation selector closes it and blocks pending selection changes', () => {
  const file = 'src/renderer/components/base/Selection.vue'
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1]
  const component = load(file, {}, {}, source).default
  const pending = []
  const events = []
  const state = {
    ...component.data(), disabled: true, itemKey: 'id', modelValue: 'tx', activeIndex: 0,
    $refs: {}, $nextTick: callback => pending.push(callback), $emit: (...args) => events.push(args),
    handleGetOffset: () => 0,
  }
  component.methods.handleShow.call(state)
  component.methods.handleClick.call(state, { id: 'wy' })
  assert.equal(state.show, false)
  assert.equal(pending.length, 0)
  assert.equal(events.length, 0)
  state.disabled = false
  component.methods.handleShow.call(state)
  assert.equal(state.show, true)
  state.disabled = true
  component.watch.disabled.call(state, true)
  assert.equal(state.show, false)
  assert.doesNotThrow(() => pending.shift()(), 'A queued open cannot access a removed dropdown after disabling')
  state.disabled = false
  component.methods.handleClick.call(state, { id: 'tx' })
  assert.equal(events.length, 0, 'Selecting the current value does not trigger another request')
  component.methods.handleClick.call(state, { id: 'wy' })
  assert.deepEqual(events.map(event => event[0]), ['update:modelValue', 'change'])
  assert.equal(events[0][1], 'wy')
})

test('Single-song selection removes duplicate releases, blocked songs, recent plays and other platforms', () => {
  const first = song('1', 'A', '夜曲')
  const duplicate = song('2', 'A', ' 夜 曲 ')
  const blocked = song('3', 'B')
  const recent = song('4', 'C')
  const valid = song('5', 'D')
  const selected = ranking.selectTracks([first, duplicate, blocked, recent, valid, song('6', 'E', 'Wrong', 'wy')].map(row), { source: 'tx', blocked: new Set([ranking.trackSignature(blocked)]), seen: new Set([recent.id]) })
  assert.deepEqual(Array.from(selected, item => item.music.id), [first.id, valid.id])
  assert.equal(ranking.isRecommendationTrack({ ...valid, id: 'tx_wrong-id' }, 'tx'), false)
})

test('Bilibili single-song selection excludes long collections, tutorials and short fragments', () => {
  const selected = ranking.selectTracks([
    song('BV17x411w7KC_1', '', '周杰伦 - 夜曲', 'bili'),
    song('BV1Q541167Qg_1', '', '歌曲合集', 'bili', '03:00'),
    song('BV1xx411c7mD_1', '', 'Piano', 'bili', '45:00'),
    song('BV1xx411c7mE_1', '', 'Preview', 'bili', '00:20'),
  ].map(row), { source: 'bili' })
  assert.deepEqual(Array.from(selected, item => item.music.id), ['bili_BV17x411w7KC_1'])
})

test('Artist variety spreads repeated artists and exploration reduces familiar-artist dominance', () => {
  const rows = [...Array.from({ length: 5 }, (_, index) => row(song(String(index), 'Familiar'))), row(song('5', 'NewA')), row(song('6', 'NewB'))]
  const familiar = ranking.selectTracks(rows, { source: 'tx', variety: 'familiar', seeds: [{ name: 'Seed', singer: 'Familiar' }], limit: 3 })
  const explore = ranking.selectTracks(rows, { source: 'tx', variety: 'explore', seeds: [{ name: 'Seed', singer: 'Familiar' }], limit: 3 })
  assert.equal(familiar[0].music.singer, 'Familiar')
  assert.equal(explore[0].music.singer, 'NewA')
  assert.ok(new Set(explore.map(item => item.music.singer)).size >= 3)
})

test('Preference sampling balances recent songs and the selected playlist with bounded artist repetition', () => {
  const recent = Array.from({ length: 15 }, (_, index) => ({ name: 'Recent' + index, singer: 'Same' }))
  const playlist = Array.from({ length: 120 }, (_, index) => ({ name: 'Playlist' + index, singer: 'Artist' + index }))
  const seeds = ranking.sampleSeeds(recent, playlist)
  assert.equal(seeds.length, 40)
  assert.equal(seeds.filter(item => item.singer == 'Same').length, 4)
  assert.equal(seeds[0].name, 'Recent0')
  assert.equal(seeds[1].name, 'Playlist0')
  assert.equal(playlist.length, 120)
})

const checkCancelled = signal => { if (signal?.aborted) throw new Error('cancelled') }

function providerHarness(overrides = {}) {
  const calls = []
  const tools = load('src/common/utils/tools.ts')
  const metadata = load('src/renderer/utils/musicSdk/bili/metadata.js')
  const utils = { normalizeImage: value => value?.replace(/^\/\//, 'https://') ?? '' }
  const toMusic = load('src/renderer/utils/musicSdk/bili/songList.js', {
    '@common/utils/common': { formatPlayTime: value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}` },
    './utils': utils,
    './discovery': {},
    './metadata': metadata,
  }).toMusic
  const httpFetch = (url, options) => {
    calls.push({ url, options })
    const list = [{ songmid: url.includes('qq.com') ? '001abc' : 123, source: url.includes('qq.com') ? 'tx' : 'wy', name: 'Song', singer: 'Artist', albumName: 'Album', types: [], _types: {} }]
    return { promise: Promise.resolve({ statusCode: 200, body: url.includes('qq.com') ? { code: 0, req: { code: 0, data: { body: { song: { list } } } } } : { code: 200, data: { resources: list } } }) }
  }
  const mockIpc = { getQQMusicStatus: async() => ({ configured: false }), getNeteaseMusicStatus: async() => ({ configured: false }) }
  const subject = load(base + 'providers.ts', {
    '@renderer/utils/request': { httpFetch: overrides.httpFetch ?? httpFetch },
    '@common/utils/tools': tools,
    '@renderer/utils': { decodeName: value => value.replace(/<[^>]+>/g, '') },
    '@renderer/utils/musicSdk/tx/musicSearch': { __esModule: true, default: { getSearchId: () => 'search-id', handleResult: value => value } },
    '@renderer/utils/musicSdk/wy/musicSearch': { __esModule: true, default: { handleResult: value => value } },
    '@renderer/utils/musicSdk/tx/utils/crypto': { zzcSign: async() => 'synthetic-sign' },
    '@renderer/utils/musicSdk/wy/utils/crypto': { eapi: (_path, value) => value },
    '@renderer/utils/musicSdk/bili/utils': {
      getBilibiliData: async(_path, params) => {
        calls.push({ params })
        return { result: [{ bvid: 'BV17x411w7KC', title: '<em>Artist</em> - Song', author: 'Uploader', duration: '03:30', pic: '//cover.example/image', cover: '' }] }
      },
    },
    '@renderer/utils/musicSdk/bili/discovery': { getVisitorHeaders: async() => ({}) },
    '@renderer/utils/musicSdk/bili/songList': { toMusic },
    './ranking': ranking,
    '@renderer/utils/ipc': { ...mockIpc, ...overrides.ipc },
  })
  return { subject, calls }
}

test('Each provider converts real search records into canonical playback tracks and Bilibili retains the uploader separately', async() => {
  const { subject, calls } = providerHarness()
  for (const source of ['tx', 'wy', 'bili']) {
    const rows = await subject.searchTracks(source, 'Song', new AbortController().signal)
    assert.equal(rows.length, 1)
    assert.equal(ranking.isRecommendationTrack(rows[0].music, source), true)
    assert.equal(rows[0].music.singer, 'Artist')
    if (source == 'bili') {
      assert.equal(rows[0].music.meta.bilibili.uploader, 'Uploader')
      assert.equal(rows[0].music.interval, '03:30')
      assert.equal(rows[0].music.meta.picUrl, 'https://cover.example/image', 'An empty search cover cannot hide the valid pic field')
    }
  }
  assert.equal(calls.length, 3, 'Each search makes one request and does not automatically retry')
  assert.equal(calls[0].options.timeout, 12000)
})

test('Cancelling a recommendation search aborts its HTTP task and rejects late results', async() => {
  let aborted = 0
  let resolve
  const { subject } = providerHarness({ httpFetch: () => ({ promise: new Promise(_resolve => { resolve = _resolve }), cancelHttp: () => { aborted++ } }) })
  const controller = new AbortController()
  const pending = subject.searchTracks('wy', 'Song', controller.signal)
  controller.abort()
  resolve({ statusCode: 200, body: { code: 200, data: { resources: [] } } })
  await assert.rejects(pending, /ai_recommend__error_cancelled/)
  assert.equal(aborted, 1)
})

test('Additional software search pages preserve the default AI page and use each provider pagination', async() => {
  const { subject, calls } = providerHarness()
  for (const source of ['tx', 'wy', 'bili']) await subject.searchTracks(source, 'Artist', new AbortController().signal, 2)
  assert.equal(calls[0].options.body['music.search.SearchCgiService'].param.page_num, 2)
  assert.equal(calls[1].options.form.offset, 20)
  assert.equal(calls[2].params.page, 2)
})

test('Platform recommendations require accounts for QQ and NetEase and use guest popularity search for Bilibili', async() => {
  const { subject, calls } = providerHarness()
  for (const source of ['tx', 'wy']) await assert.rejects(subject.platformTracks(source, new AbortController().signal), /recommend__login_required/)
  const rows = await subject.platformTracks('bili', new AbortController().signal)
  assert.equal(rows[0].origin, 'popular')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].params.order, 'click')
  assert.equal(calls[0].params.tids, 3)
})

const engineHarness = ({ plan, search, rank, now } = {}) => load(base + 'engine.ts', {
  '@renderer/utils/aiRecommendation': { planAiRecommendations: plan ?? (async() => [{ keyword: 'first' }, { keyword: 'second' }]), rankAiRecommendations: rank ?? (async() => []) },
  './providers': { checkCancelled, searchTracks: search ?? (async() => []) },
  './ranking': ranking,
  './aiRanking': aiRanking,
}, now ? { Date: { now } } : {})
const options = () => ({ context: { jobId: 'job', source: 'tx', hint: 'Evening', seeds: [] }, signal: new AbortController().signal, blocked: new Set(), seen: new Set(), onStage() {} })

test('Recommendation generation keeps only real songs selected by the model from the chosen platform', async() => {
  const called = []
  const engine = engineHarness({
    search: async(source, keyword) => { called.push([source, keyword]); return [row(song('1')), row(song('2', 'Other')), row(song('3', 'Wrong', 'Other platform', 'wy'))] },
    rank: async input => {
      assert.equal(input.kind, 'tracks')
      assert.equal(input.trackCandidates.length, 2)
      return [{ id: 'tx_2', reason: 'A fitting song' }, { id: 'tx_2' }, { id: 'tx_999', reason: 'Invented' }, { id: 'wy_3' }]
    },
  })
  const result = await engine.generateTracks(options())
  assert.deepEqual(Array.from(result.pool, item => item.music.id), ['tx_2'])
  assert.equal(result.pool[0].reason, 'A fitting song')
  assert.equal(called.length, 2)
})

test('A failed search keeps other results and model ranking failure falls back to local selection', async() => {
  const engine = engineHarness({ search: async(_source, keyword) => { if (keyword == 'first') throw new Error('offline'); return [row(song('2'))] }, rank: async() => { throw new Error('model unavailable') } })
  const result = await engine.generateTracks(options())
  assert.equal(result.pool.length, 1)
  assert.equal(result.notice, 'recommend__rank_fallback')
})

test('Cancellation after planning prevents searches and cancellation during a search prevents ranking', async() => {
  for (const where of ['plan', 'search']) {
    const controller = new AbortController()
    let searches = 0
    let rankings = 0
    const engine = engineHarness({
      plan: async() => { if (where == 'plan') controller.abort(); return [{ keyword: 'first' }, { keyword: 'second' }] },
      search: async() => { searches++; controller.abort(); return [row(song('1'))] },
      rank: async() => { rankings++; return [] },
    })
    await assert.rejects(engine.generateTracks({ ...options(), signal: controller.signal }), /cancelled/)
    assert.equal(searches, where == 'plan' ? 0 : 1)
    assert.equal(rankings, 0)
  }
})

test('A platform rate limit stops further recommendation searches immediately', async() => {
  let searches = 0
  const engine = engineHarness({ search: async() => { searches++; throw new Error('bilibili__error_rate_limit') } })
  await assert.rejects(engine.generateTracks({ ...options(), context: { ...options().context, source: 'bili' } }), /bilibili__error_rate_limit/)
  assert.equal(searches, 1)
})

const profileHarness = ({ lists = [{ id: 'my-list' }], songs = () => [song('1')], history = async() => [] } = {}) => load(base + 'profile.ts', {
  '@renderer/store/list/listManage': { getListMusicLibrary: async id => songs(id) },
  '@renderer/store/list/state': { userLists: lists },
  './listeningIpc': { getListening: history },
  './softwareProfile': softwareProfile,
  './ranking': ranking,
  './providers': { checkCancelled },
})

test('AI profile opt-out sends no personal summaries while library exclusion remains local', async() => {
  const calls = []
  let historyReads = 0
  const profile = profileHarness({ songs: id => { calls.push(id); return [song('1')] }, history: async() => { historyReads++; return [] } })
  const anonymous = await profile.getRecommendationProfile(false, 'private-playlist', true)
  assert.equal(anonymous.seeds.length, 0)
  assert.equal(anonymous.recentSeeds.length, 0)
  assert.equal(anonymous.avoidedSeeds.length, 0)
  assert.deepEqual(calls, ['my-list'], 'Only visible user lists are read, locally, to exclude owned songs')
  assert.ok(anonymous.owned.has('tx_1'))
  assert.equal(historyReads, 1)
  calls.length = 0
  await profile.getRecommendationProfile(false, 'private-playlist', false)
  assert.deepEqual(calls, ['my-list'])
  assert.equal(historyReads, 1, 'Opt-out with recent avoidance off does not read listening history')
})

const checkpoint = (music, id, overrides = {}) => ({
  sessionId: id, revision: 1, track: { id: music.id, name: music.name, singer: music.singer, source: music.source },
  startedAt: Date.now() - 250000, updatedAt: Date.now() - 1000,
  duration: 210, listened: 210, coverage: 210, completed: true, skipped: false, ...overrides,
})

test('AI taste uses completed/repeated listening, excludes brief starts and samples only visible reference playlists', async() => {
  const repeated = song('repeat', 'Recent Artist')
  const partial = song('partial', 'Partial Artist')
  const skipped = song('skipped', 'Skipped Artist')
  const brief = song('brief', 'Brief Artist')
  const playlist = song('playlist', 'Library Artist')
  const unselected = song('unselected', 'Other List Artist')
  const history = [
    checkpoint(repeated, 'repeat1'), checkpoint(repeated, 'repeat2'),
    checkpoint(partial, 'partial', { listened: 40, coverage: 40, completed: false }),
    checkpoint(brief, 'brief', { listened: 2, coverage: 2, completed: false }),
    ...[1, 2, 3].map(id => checkpoint(skipped, 'skip' + id, { listened: 8, coverage: 8, skipped: true, completed: false })),
  ]
  const calls = []
  const profile = profileHarness({ lists: [{ id: 'selected' }, { id: 'other' }], songs: id => { calls.push(id); return [id == 'selected' ? playlist : unselected] }, history: async() => history })
  const result = await profile.getRecommendationProfile(true, 'selected', true)
  assert.deepEqual(calls, ['selected', 'other'])
  assert.equal(result.seeds[0].name, repeated.name)
  assert.equal(result.seeds[0].basis, 'repeat')
  assert.ok(result.seeds[0].weight > result.seeds.find(seed => seed.name == partial.name).weight)
  assert.ok(result.seeds.some(seed => seed.name == playlist.name))
  assert.equal(result.seeds.some(seed => [unselected.name, brief.name, skipped.name].includes(seed.name)), false)
  assert.ok(result.owned.has(unselected.id), 'An unselected reference list still excludes its owned songs')
  assert.ok(result.recent.has(repeated.id))
  assert.equal(result.recent.has(brief.id), false)
  assert.equal(result.recent.has(skipped.id), false)
  assert.ok(result.avoidedSeeds.some(seed => seed.name == skipped.name))
  assert.ok(result.skipped.has(skipped.id))
  assert.equal(JSON.stringify(result.seeds).includes('sessionId'), false)
  assert.equal(JSON.stringify(result.recentSeeds).includes('updatedAt'), false)
})

test('AI cold-start taste defaults to all user playlists and remains bounded across large libraries', async() => {
  const calls = []
  const profile = profileHarness({ lists: [{ id: 'a' }, { id: 'b' }], songs: id => {
    calls.push(id)
    return Array.from({ length: 200 }, (_, index) => song(id + index, id + ' Artist' + (index % 30)))
  } })
  const result = await profile.getRecommendationProfile(true, 'love', false)
  assert.deepEqual(calls, ['a', 'b'], 'Legacy favourites are never read as a hidden reference')
  assert.ok(result.seeds.length <= 24 && result.seeds.length >= 12)
  assert.ok(result.seeds.every(seed => seed.basis == 'playlist'))
  assert.ok(result.seeds.some(seed => seed.singer.startsWith('a Artist')))
  assert.ok(result.seeds.some(seed => seed.singer.startsWith('b Artist')), 'Taste sampling rotates across reference playlists')
  assert.ok(result.owned.has('tx_b199'), 'Full-library exclusion is not limited by the taste sample')
  for (const artist of new Set(result.seeds.map(seed => seed.singer))) assert.ok(result.seeds.filter(seed => seed.singer == artist).length <= 2)
  assert.equal(result.recentSeeds.length, 0)
})

test('Cancelling AI profile preparation prevents the next local playlist read', async() => {
  const controller = new AbortController()
  const calls = []
  const profile = profileHarness({ lists: [{ id: 'a' }, { id: 'b' }], songs: id => { calls.push(id); controller.abort(); return [] } })
  await assert.rejects(profile.getRecommendationProfile(true, '', false, controller.signal), /cancelled/)
  assert.deepEqual(calls, ['a'])
})

test('Concrete AI suggestions require the real song and performer; owned and disliked songs never reach the ranking model', async() => {
  const valid = song('valid', 'Singer', 'Real Song')
  const owned = song('owned', 'Owned Artist')
  const disliked = song('disliked', 'Disliked Artist')
  const engine = engineHarness({
    plan: async() => [{ keyword: 'Real Song Singer', kind: 'track', target: { name: 'Real Song', singer: 'Singer' } }, { keyword: 'Adjacent Artist', kind: 'artist' }],
    search: async(_source, query) => query == 'Real Song Singer'
      ? [row(song('cover', 'Someone Else', 'Real Song')), row(song('live', 'Singer', 'Real Song (Live)')), row(song('unknown', '', 'Real Song')), row(valid)]
      : [row(owned), row(disliked)],
    rank: async input => {
      assert.deepEqual(Array.from(input.trackCandidates, item => item.id), [valid.id])
      assert.equal(input.trackCandidates[0].retrieval[0], 'Real Song Singer')
      return [{ id: valid.id, reason: 'Related to your request' }]
    },
  })
  const result = await engine.generateTracks({ ...options(), owned: softwareProfile.buildOwnedTrackKeys([[{ ...owned, id: 'wy_999', source: 'wy' }]]), allowed: music => music.id != disliked.id })
  assert.deepEqual(Array.from(result.pool, item => item.music.id), [valid.id])
})

test('Multi-query fusion counts a recording once per branch and preserves several retrieval directions', () => {
  const common = row(song('common', 'Common Artist'))
  const branches = Array.from({ length: 6 }, (_, direction) => ({
    key: 'q' + direction, intent: { keyword: 'Direction ' + direction, kind: 'discovery' },
    rows: [common, common, ...Array.from({ length: 20 }, (_, index) => row(song('q' + direction + 's' + index, 'Artist ' + direction)))],
  }))
  const pool = aiRanking.fuseAiCandidates(branches, { source: 'tx', variety: 'balanced' })
  assert.equal(pool.filter(item => item.music.id == common.music.id).length, 1)
  assert.equal(pool.length, 40)
  assert.equal(pool.find(item => item.music.id == common.music.id).ai.directions.length, 6)
  assert.ok(new Set(pool.slice(0, 12).map(item => item.music.singer)).size >= 5)
})

test('AI ranking keeps its leading choice, diversifies repeated albums, and never restores rejected candidates', () => {
  const candidates = Array.from({ length: 10 }, (_, index) => ({ ...row(song(String(index), index < 6 ? 'Same Artist' : 'Artist ' + index)), ai: { relevance: 0.8, directions: ['q' + (index % 3)] } }))
  const ranked = aiRanking.applyAiRanks(candidates, [
    { id: 'tx_3', reason: 'Top model choice' }, ...[0, 1, 2, 6, 7, 8, 9].map(id => ({ id: 'tx_' + id, reason: 'Fits' })),
    { id: 'tx_4', reason: 'Reject wins' }, { id: 'tx_4', exclude: true }, { id: 'tx_999', reason: 'Fabrication' },
  ])
  const pool = aiRanking.selectAiBatch(ranked, { source: 'tx', variety: 'explore', limit: 6 })
  assert.equal(pool[0].music.id, 'tx_3')
  assert.ok(new Set(pool.map(item => item.music.singer)).size >= 4)
  assert.equal(ranked.some(item => item.music.id == 'tx_4'), false)
  assert.equal(ranked.some(item => item.music.id == 'tx_999'), false)
  assert.equal(ranked.some(item => item.music.id == 'tx_5'), false, 'Omitted candidates must not re-enter a successful shortlist')
})

test('Rejecting all real candidates yields an empty batch instead of local fallback resurrecting them', async() => {
  const engine = engineHarness({ search: async() => [row(song('1'))], rank: async() => [{ id: 'tx_1', reason: '', exclude: true }] })
  const result = await engine.generateTracks(options())
  assert.equal(result.pool.length, 0)
  assert.notEqual(result.notice, 'recommend__rank_fallback')
})

test('AI generation caps catalogue searches at six and concurrency at two with exactly two model calls', async() => {
  let active = 0
  let maximum = 0
  let searches = 0
  let models = 0
  const engine = engineHarness({
    plan: async() => { models++; return Array.from({ length: 12 }, (_, index) => ({ keyword: 'query' + index })) },
    search: async(_source, query) => {
      searches++; maximum = Math.max(maximum, ++active)
      await new Promise(resolve => setImmediate(resolve))
      active--
      return [row(song(query, query))]
    },
    rank: async input => { models++; return input.trackCandidates.map(item => ({ id: item.id, reason: 'Fits' })) },
  })
  const result = await engine.generateTracks(options())
  assert.equal(searches, 6)
  assert.equal(maximum, 2)
  assert.equal(models, 2)
  assert.equal(result.pool.length, 6)
})

test('AI search deadline stops starting new queries while preserving real partial results', async() => {
  let time = 0
  let searches = 0
  const engine = engineHarness({
    now: () => time,
    plan: async() => Array.from({ length: 6 }, (_, index) => ({ keyword: 'query' + index })),
    search: async(_source, query) => { searches++; time += 16000; return [row(song(query, query))] },
    rank: async input => input.trackCandidates.map(item => ({ id: item.id, reason: 'Fits' })),
  })
  const result = await engine.generateTracks(options())
  assert.equal(searches, 2)
  assert.equal(result.pool.length, 2)
  assert.equal(result.notice, 'recommend__partial')
})

test('AI recovery searches past owned first pages with eight total requests and two model calls', async() => {
  const calls = []
  let active = 0
  let maximum = 0
  let models = 0
  const owned = new Set()
  const engine = engineHarness({
    plan: async() => { models++; return Array.from({ length: 6 }, (_, index) => ({ keyword: 'Artist' + index, kind: 'artist' })) },
    search: async(_source, query, _signal, page) => {
      calls.push([query, page]); maximum = Math.max(maximum, ++active)
      await new Promise(resolve => setImmediate(resolve))
      active--
      const songs = Array.from({ length: 20 }, (_, index) => row(song(query + 'p' + page + 's' + index, query)))
      if (page == 1) for (const item of songs) owned.add(item.music.id)
      return songs
    },
    rank: async input => { models++; return input.trackCandidates.map(item => ({ id: item.id, reason: 'Fits' })) },
  })
  const result = await engine.generateTracks({ ...options(), owned })
  assert.equal(calls.length, 8)
  assert.ok(calls.slice(0, 6).every(([, page]) => page == 1), 'Every direction gets a first page before recovery')
  assert.ok(calls.slice(6).every(([, page]) => page == 2))
  assert.equal(maximum, 2)
  assert.equal(models, 2)
  assert.equal(result.pool.length, 40)
  assert.ok(result.pool.every(item => !owned.has(item.music.id)))
})

test('AI avoids recovery requests when enough new candidates already exist', async() => {
  const calls = []
  const seen = new Set()
  const engine = engineHarness({
    plan: async() => [{ keyword: 'exhausted' }, { keyword: 'newA' }, { keyword: 'newB' }],
    search: async(_source, query, _signal, page) => {
      calls.push([query, page])
      const rows = Array.from({ length: 20 }, (_, index) => row(song(query + index, query + index)))
      if (query == 'exhausted') for (const item of rows) seen.add(item.music.id)
      return rows
    },
    rank: async input => input.trackCandidates.map(item => ({ id: item.id, reason: '' })),
  })
  const result = await engine.generateTracks({ ...options(), seen })
  assert.equal(calls.length, 3)
  assert.ok(calls.every(([, page]) => page == 1))
  assert.equal(result.pool.length, 40)
})

test('Recovery stops at the shared search deadline and cancelled pages cannot reach ranking', async() => {
  for (const mode of ['deadline', 'cancel']) {
    let time = 0
    let ranked = 0
    const calls = []
    const seen = new Set()
    const controller = new AbortController()
    const engine = engineHarness({
      now: () => time,
      plan: async() => [{ keyword: 'Artist', kind: 'artist' }],
      search: async(_source, query, _signal, page) => {
        calls.push(page)
        const rows = Array.from({ length: 20 }, (_, index) => row(song(String(page * 100 + index), query)))
        if (page == 1) for (const item of rows.slice(0, 19)) seen.add(item.music.id)
        if (mode == 'deadline') time = 31000
        if (page == 2) controller.abort()
        return rows
      },
      rank: async input => { ranked++; return input.trackCandidates.map(item => ({ id: item.id, reason: '' })) },
    })
    const pending = engine.generateTracks({ ...options(), signal: controller.signal, seen })
    if (mode == 'deadline') {
      const result = await pending
      assert.equal(result.pool.length, 1)
      assert.deepEqual(calls, [1])
    } else {
      await assert.rejects(pending, /cancelled/)
      assert.deepEqual(calls, [1, 2])
      assert.equal(ranked, 0)
    }
  }
})

test('Duplicate planned queries and repeated pages cannot amplify one retrieval direction', async() => {
  const queries = []
  const engine = engineHarness({
    plan: async() => [{ keyword: 'Artist' }, { keyword: ' Artist ' }, { keyword: 'ARTIST' }, { keyword: 'Another' }],
    search: async(_source, query) => { queries.push(query); return [row(song(query, query))] },
    rank: async input => input.trackCandidates.map(item => ({ id: item.id, reason: '' })),
  })
  await engine.generateTracks(options())
  assert.deepEqual(queries, ['Artist', 'Another'])
  const first = { key: 'q0', intent: { keyword: 'Artist' }, rows: [row(song('1', 'A'))] }
  const second = { key: 'q1', intent: { keyword: 'Another' }, rows: [row(song('2', 'B'))] }
  const original = aiRanking.fuseAiCandidates([first, second], { source: 'tx' })
  const duplicate = aiRanking.fuseAiCandidates([first, first, second], { source: 'tx' })
  assert.deepEqual(Array.from(duplicate, row => [row.music.id, row.ai.relevance]), Array.from(original, row => [row.music.id, row.ai.relevance]))
})

test('HTTP rate limiting is reported and prevents further AI query batches', async() => {
  const { subject } = providerHarness({ httpFetch: () => ({ promise: Promise.resolve({ statusCode: 429, body: {} }) }) })
  await assert.rejects(subject.searchTracks('wy', 'Artist', new AbortController().signal), /recommend__error_rate_limit/)
  const calls = []
  const engine = engineHarness({
    plan: async() => Array.from({ length: 6 }, (_, index) => ({ keyword: 'Artist' + index })),
    search: async(_source, keyword) => { calls.push(keyword); throw new Error('recommend__error_rate_limit') },
  })
  await assert.rejects(engine.generateTracks(options()), /recommend__error_rate_limit/)
  assert.equal(calls.length, 2, 'Only the already-started concurrent batch is allowed to finish')
})

test('Model scores guide relevance without duplicated IDs inflating confidence', () => {
  const candidates = [row(song('1', 'A')), row(song('2', 'B')), row(song('3', 'C'))]
  const ranks = [{ id: 'tx_1', reason: 'weak', score: 0.15 }, { id: 'tx_2', reason: 'strong', score: 0.95 }]
  const once = aiRanking.applyAiRanks(candidates, ranks)
  const duplicate = aiRanking.applyAiRanks(candidates, [ranks[0], ranks[0], ranks[1]])
  assert.deepEqual(Array.from(once, row => row.ai.relevance), Array.from(duplicate, row => row.ai.relevance))
  assert.equal(aiRanking.selectAiBatch(once, { source: 'tx' })[0].music.id, 'tx_2')
  assert.equal(once.length, 2, 'A successful shortlist does not include an omitted third candidate')
})

test('AI selection respects newly owned, dismissed and seen songs', () => {
  const pool = Array.from({ length: 30 }, (_, index) => row(song(String(index), 'Artist' + index)))
  const owned = softwareProfile.buildOwnedTrackKeys([[song('23')]])
  const batch = aiRanking.selectAiBatch(pool, { source: 'tx', seen: new Set(pool.slice(0, 20).map(item => item.music.id)), blocked: new Set(['tx_22']), owned, allowed: music => music.id != 'tx_24' })
  assert.deepEqual(new Set(batch.map(item => item.music.id)), new Set(['tx_20', 'tx_21', 'tx_25', 'tx_26', 'tx_27', 'tx_28', 'tx_29']))
})

const sessionHarness = storage => load(base + 'session.ts', { '@common/utils/vueTools': { reactive: value => value, shallowReactive: value => value, markRaw: value => value }, './ranking': ranking }, { localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } })

test('Recommendation results and dismissals persist separately by platform without credentials, lyrics or media URLs', () => {
  const storage = new Map()
  const session = sessionHarness(storage)
  const music = song('1')
  music.meta.audioUrl = 'https://private-audio.example'
  music.meta.cookie = 'secret-cookie'
  music.lyrics = 'private-lyrics'
  session.recommendationFeeds.tx.pool = [row(music)]
  session.recommendationFeeds.tx.ids = [music.id]
  session.blockRecommendation(row(music))
  const saved = [...storage.values()][0]
  assert.equal(saved.includes('private-audio'), false)
  assert.equal(saved.includes('secret-cookie'), false)
  assert.equal(saved.includes('private-lyrics'), false)
  const restored = sessionHarness(storage)
  assert.equal(restored.recommendationFeeds.tx.pool[0].music.id, music.id)
  assert.equal(restored.recommendationFeeds.wy.pool.length, 0)
  assert.equal(restored.getBlockedKeys().has(music.id), true)
})

test('Damaged cache and malformed cross-platform cached songs cannot break recommendation startup', () => {
  const key = 'lx__track_recommendations_v1'
  assert.doesNotThrow(() => sessionHarness(new Map([[key, 'broken JSON']])))
  const session = sessionHarness(new Map([[key, JSON.stringify({ feeds: { tx: { pool: [row(song('1', 'Wrong', 'Wrong platform', 'wy')), { music: null }], ids: ['wy_1'] } } })]]))
  assert.equal(session.recommendationFeeds.tx.pool.length, 0)
  assert.equal(session.recommendationFeeds.tx.ids.length, 0)
})

test('AI cache migration keeps consent and shared feedback while discarding legacy recommendation results', () => {
  const storage = new Map([['lx__track_recommendations_v1', JSON.stringify({
    preferences: { listId: 'love', useProfile: true, hint: 'Night' },
    feeds: { tx: { pool: [row(song('1'))], ids: ['tx_1'] } }, blocked: [{ id: 'tx_2', signature: 'song|artist' }],
  })]])
  const session = sessionHarness(storage)
  assert.equal(session.recommendationPreferences.listId, '')
  assert.equal(session.recommendationPreferences.useProfile, true)
  assert.equal(session.recommendationFeeds.tx.pool.length, 0)
  assert.ok(session.getBlockedKeys().has('tx_2'))
  session.recommendationFeeds.tx.pool = [{ ...row(song('3')), ai: { relevance: 9, directions: ['q0', 'q5', 'private prompt'], history: 'private-history' } }]
  session.saveRecommendations()
  const restored = sessionHarness(storage)
  assert.equal(restored.recommendationFeeds.tx.pool[0].ai.relevance, 1)
  assert.deepEqual(Array.from(restored.recommendationFeeds.tx.pool[0].ai.directions), ['q0', 'q5'])
  assert.equal([...storage.values()][0].includes('private-history'), false)
  assert.equal([...storage.values()][0].includes('private prompt'), false)
})

test('Full AI results survive restart beyond twenty songs and old unfiltered pools are invalidated', () => {
  const storage = new Map()
  const session = sessionHarness(storage)
  const pool = Array.from({ length: 40 }, (_, index) => row(song(String(index), 'Artist' + index)))
  Object.assign(session.recommendationFeeds.tx, { pool, ids: pool.map(row => row.music.id), seen: pool.map(row => row.music.id) })
  assert.equal(session.saveRecommendations(), true)
  const restored = sessionHarness(storage)
  assert.equal(restored.recommendationFeeds.tx.ids.length, 40)
  assert.equal(restored.recommendationFeeds.tx.pool.length, 40)
  const old = JSON.parse(storage.get('lx__track_recommendations_v1'))
  old.algorithmVersion = 2
  old.preferences.hint = 'Keep my preference'
  old.blocked = [{ id: 'tx_blocked', signature: 'blocked|artist' }]
  storage.set('lx__track_recommendations_v1', JSON.stringify(old))
  const migrated = sessionHarness(storage)
  assert.equal(migrated.recommendationFeeds.tx.pool.length, 0)
  assert.equal(migrated.recommendationPreferences.hint, 'Keep my preference')
  assert.ok(migrated.getBlockedKeys().has('tx_blocked'))
})

test('Bilibili recommendation metadata rejects promotional sentences as artists', () => {
  const metadata = load('src/renderer/utils/musicSdk/bili/metadata.js')
  assert.equal(metadata.parseTrackMetadata('只要听10秒，保证你爱上这首歌《7 Years》').singer, '')
  assert.equal(metadata.parseTrackMetadata('周杰伦《晴天》').singer, '周杰伦')
})

test('Bilibili recommendation artist matching only subscribes visible unknown songs and cancels on hide and unmount', async() => {
  const mounted = []
  const unmounted = []
  const listeners = new Map()
  const document = { hidden: false, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) }
  const requests = []
  const cancellations = []
  const updated = []
  let intersect
  const rows = { value: [row(song('BV17x411w7KC_1', '', 'Unknown', 'bili')), row(song('BV1Q541167Qg_1', 'Known', 'Known', 'bili')), row(song('1')), row(song('BV1xx411c7mD_1', '', 'Offscreen', 'bili'))] }
  const elements = rows.value.map(row => ({ dataset: { recommendationId: row.music.id } }))
  const subject = load(base + 'useVisibleArtists.ts', {
    '@common/utils/vueTools': { nextTick: async() => {}, watch() {}, onMounted: callback => mounted.push(callback), onBeforeUnmount: callback => unmounted.push(callback) },
    '@renderer/core/music/bilibiliMetadataQueue': { requestBilibiliMetadata: (music, callback) => { requests.push({ music, callback }); return () => cancellations.push(music.id) } },
  }, { document, IntersectionObserver: class { constructor(callback) { intersect = callback } observe() {} disconnect() {} } })
  subject.default({ value: { querySelectorAll: () => elements } }, rows, music => updated.push(music))
  mounted.forEach(callback => callback())
  await new Promise(resolve => setImmediate(resolve))
  intersect(elements.slice(0, 3).map(target => ({ target, isIntersecting: true })))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].music.name, 'Unknown')
  document.hidden = true
  listeners.get('visibilitychange')()
  assert.deepEqual(cancellations, [requests[0].music.id])
  document.hidden = false
  listeners.get('visibilitychange')()
  assert.equal(requests.length, 2)
  unmounted.forEach(callback => callback())
  requests[1].callback(song('BV17x411w7KC_1', 'Resolved', 'Song', 'bili'))
  assert.equal(updated.length, 0)
  assert.equal(listeners.has('visibilitychange'), false)
})

test('Recommendation view cancels stale platform jobs and retains cached songs on generation failure', async() => {
  const vue = require('vue')
  const { parse, compileScript } = require('@vue/compiler-sfc')
  const file = 'src/renderer/views/Recommendations/index.vue'
  const source = compileScript(parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).descriptor, { id: 'recommendation-test' }).content
  const prefs = vue.reactive({ source: 'tx', hint: 'Evening', useProfile: false, listId: 'love', avoidRecent: true, variety: 'balanced' })
  const feed = source => { const initial = row(song('1', 'Artist', 'Song', source)); return vue.reactive({ pool: [initial], ids: [initial.music.id], seen: [], updatedAt: 1, mode: 'ai', notice: '' }) }
  const feeds = { tx: feed('tx'), wy: feed('wy'), bili: feed('bili') }
  const route = vue.reactive({ query: { source: 'tx' } })
  const pending = []
  const queues = []
  const plays = []
  const ownedKeys = new Set()
  let configResponse = async() => ({ configured: true })
  const module = load(file, {
    vue,
    './RecommendationList.vue': {},
    '@common/utils/vueTools': { ...vue, onBeforeUnmount() {} },
    '@common/utils/vueRouter': { useRouter: () => ({ replace() {} }), useRoute: () => route },
    '@renderer/plugins/i18n': { useI18n: () => key => key },
    '@common/constants': { LIST_IDS: { LOVE: 'love', TEMP: 'temp' } },
    '@renderer/store/list/state': { userLists: [] },
    '@renderer/store/list/action': { setTempList: async(id, list) => queues.push({ id, list }) },
    '@renderer/core/player/action': { playList: (id, index) => plays.push({ id, index }) },
    '@renderer/core/dislikeList': { hasDislike: () => false },
    '@renderer/utils/aiRecommendation': { getAiRecommendConfig: () => configResponse(), cancelAiRecommendation: async() => {}, createAiJobId: () => 'job', getRecommendationError: error => error.message },
    '@renderer/utils/recommendation/session': { recommendationPreferences: prefs, recommendationFeeds: feeds, recommendationSources: ['tx', 'wy', 'bili'], recommendationBlocked: [], getBlockedKeys: () => new Set(), saveRecommendations: () => true },
    '@renderer/utils/recommendation/profile': { getRecommendationProfile: async() => ({ seeds: [], recentSeeds: [], avoidedSeeds: [], recent: new Set(), owned: new Set(), skipped: new Set() }) },
    '@renderer/utils/recommendation/engine': { generateTracks: input => new Promise((resolve, reject) => pending.push({ input, resolve, reject })) },
    '@renderer/utils/recommendation/providers': { checkCancelled },
    '@renderer/utils/recommendation/ranking': ranking,
    '@renderer/utils/recommendation/aiRanking': aiRanking,
    '@renderer/utils/recommendation/softwareProfile': softwareProfile,
    '@renderer/utils/recommendation/softwareData': { getOwnedLibraryKeys: async() => new Set(ownedKeys) },
    '@renderer/utils/recommendation/useVisibleArtists': { __esModule: true, default() {} },
    '@renderer/views/songList/List/components/AiRecommendationSettings.vue': {},
    './SoftwareRecommendations.vue': {},
  }, { window: { app_event: { on() {}, off() {} } } }, source)
  const scope = vue.effectScope()
  const state = scope.run(() => module.default.setup({}, { expose() {} }))
  const first = state.run(true)
  await new Promise(resolve => setImmediate(resolve))
  prefs.source = 'wy'
  await vue.nextTick()
  assert.equal(pending[0].input.signal.aborted, true)
  pending[0].resolve({ pool: [row(song('2'))], notice: '' })
  await first
  assert.equal(feeds.tx.pool[0].music.id, 'tx_1')
  const second = state.run(true)
  await new Promise(resolve => setImmediate(resolve))
  pending[1].reject(new Error('model failed'))
  await second
  assert.equal(feeds.wy.pool[0].music.id, 'wy_1', 'An error must not blank existing results')
  assert.equal(state.loading.value, false)
  await state.play(0)
  assert.equal(queues[0].list[0].id, 'wy_1')
  assert.deepEqual(plays, [{ id: 'temp', index: 0 }])
  assert.deepEqual(Array.from(state.seedLists.value, list => list.id), [''], 'AI reference choices do not include hidden favourites')
  ownedKeys.add('wy_1')
  await state.refreshOwned()
  assert.equal(state.rows.value.length, 0, 'A cached recommendation disappears after it is added to a user playlist')
  const complete = state.run()
  await new Promise(resolve => setImmediate(resolve))
  const completePool = Array.from({ length: 32 }, (_, index) => row(song(String(index + 100), 'Artist ' + index, 'New ' + index, 'wy')))
  pending[2].resolve({ pool: completePool, notice: '' })
  await complete
  assert.equal(state.rows.value.length, 32, 'All selected songs are visible without a second batch')
  assert.equal(feeds.wy.ids.length, 32)
  await state.play(31)
  assert.equal(queues[1].list.length, 32, 'Playback uses the entire visible list')
  assert.equal(queues[1].list[31].id, state.rows.value[31].music.id)
  assert.equal(plays[1].index, 31)
  const next = state.run()
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(completePool.every(row => pending[3].input.seen.has(row.music.id)), 'A later generation avoids all previously displayed songs')
  state.cancel()
  pending[3].resolve({ pool: [], notice: '' })
  await next
  assert.equal(state.rows.value.length, 32, 'Cancellation preserves the complete previous result')
  // Metadata correction may reveal that different video IDs are one recording.
  const duplicate = { ...completePool[0], music: { ...completePool[0].music, id: 'wy_999', meta: { ...completePool[0].music.meta, songId: '999' } } }
  feeds.wy.pool = [...feeds.wy.pool, duplicate]
  feeds.wy.ids = [...feeds.wy.ids, duplicate.music.id]
  assert.equal(state.rows.value.length, 32, 'Corrected metadata cannot reintroduce duplicate recordings')
  let resolveConfig
  configResponse = () => new Promise(resolve => { resolveConfig = resolve })
  const third = state.run(true)
  await new Promise(resolve => setImmediate(resolve))
  prefs.source = 'bili'
  await vue.nextTick()
  resolveConfig({ configured: false })
  await third
  assert.equal(state.showSettings.value, false, 'An outdated configuration lookup must not open a modal on the new platform')
  scope.stop()
})
