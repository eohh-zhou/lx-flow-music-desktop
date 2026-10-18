const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, extra = {}, sourceOverride) {
  const module = { exports: {} }
  const raw = fs.readFileSync(path.join(root, file), 'utf8')
  const source = sourceOverride ?? (file.endsWith('.vue') ? raw.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1] : raw)
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('node:') || name == 'fs') return require(name)
      throw new Error('Unmocked dependency: ' + name)
    },
    URL,
    Buffer,
    AbortController,
    console: { log() {} },
    setTimeout,
    clearTimeout,
    ...extra,
  }, { filename: file })
  return module.exports
}

const mediaHeaders = load('src/common/utils/bilibili.ts')
const tools = load('src/common/utils/tools.ts')
const trackMetadata = load('src/renderer/utils/musicSdk/bili/metadata.js')
const bvid = 'BV17x411w7KC'
const video = {
  bvid,
  title: 'Video collection',
  desc: 'Description',
  pic: '//i0.hdslb.com/cover.jpg',
  owner: { name: 'Uploader' },
  pages: Array.from({ length: 23 }, (_, i) => ({ page: i + 1, cid: 100 + i, part: `Track ${i + 1}`, duration: 60 + i })),
}
const formatPlayTime = value => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`

function harness(respond = () => ({})) {
  const requests = []
  const utils = load('src/renderer/utils/musicSdk/bili/utils.js', {
    '../../request': {
      httpFetch(url, options) {
        requests.push({ url, options })
        return { promise: Promise.resolve().then(() => respond(new URL(url), options)).then(result => result.statusCode ? result : { statusCode: 200, body: { code: 0, data: result } }) }
      },
    },
    '@common/utils/bilibili': mediaHeaders,
  })
  const discovery = load('src/renderer/utils/musicSdk/bili/discovery.js', { './utils': utils })
  const songList = load('src/renderer/utils/musicSdk/bili/songList.js', {
    './utils': utils,
    './discovery': discovery,
    './metadata': trackMetadata,
    '@common/utils/common': { formatPlayTime },
  }).default
  const sdk = load('src/renderer/utils/musicSdk/bili/index.js', { './songList': { default: songList, __esModule: true }, './utils': utils }).default
  const listDetailInfo = {}
  const action = load('src/renderer/store/songList/action.ts', {
    '@common/utils/lruCache': load('src/common/utils/lruCache.ts'),
    '@renderer/utils': { ...tools, deduplicationList: list => Array.from(new Map(list.map(item => [item.id, item])).values()) },
    '@renderer/utils/musicSdk': { __esModule: true, default: { bili: sdk } },
    '@common/utils/vueTools': { markRaw: value => value, markRawList: value => value },
    './state': { listDetailInfo, tags: {}, listInfo: {}, selectListInfo: {}, isVisibleListDetail: {}, openSongListInputInfo: {} },
  }, { window: { i18n: { t: key => key } } })
  return { utils, discovery, songList, sdk, requests, action, listDetailInfo }
}

test('Bilibili recognizes favorites, collection, series and video link variants', () => {
  const { utils } = harness()
  for (const input of ['123', 'fav:123', 'https://space.bilibili.com/99/favlist?fid=123', 'https://www.bilibili.com/medialist/detail/ml123', 'https://www.bilibili.com/list/ml123', 'https://www.bilibili.com/playlist/pl123', '分享：https://space.bilibili.com/99/favlist?fid=123。']) {
    assert.equal(utils.parseBilibiliListInput(input).key, 'fav:123', input)
  }
  for (const input of ['season:99:123', 'space.bilibili.com/99/lists/123?type=season', 'https://space.bilibili.com/99/channel/collectiondetail?sid=123', 'https://www.bilibili.com/medialist/play/99?business=space_collection&business_id=123', 'https://www.bilibili.com/list/99?sid=123&type=season']) {
    assert.equal(utils.parseBilibiliListInput(input).key, 'season:99:123', input)
  }
  for (const input of ['series:99:123', 'https://space.bilibili.com/99/lists/123?type=series', 'https://space.bilibili.com/99/channel/seriesdetail?sid=123', 'https://www.bilibili.com/medialist/play/99?business=space_series&business_id=123', 'https://www.bilibili.com/list/99?sid=123']) {
    assert.equal(utils.parseBilibiliListInput(input).key, 'series:99:123', input)
  }
  for (const input of [bvid, `video:${bvid}`, `https://www.bilibili.com/video/${bvid}?p=4`, `分享 https://www.bilibili.com/video/${bvid}）`]) {
    assert.equal(utils.parseBilibiliListInput(input).key, `video:${bvid}`, input)
  }
  assert.equal(utils.parseBilibiliListInput('AV170001').key, 'video:av170001')
  assert.equal(utils.isBilibiliListInput('123'), false, 'Other platforms also use numeric playlist IDs')
  assert.equal(utils.isBilibiliListInput(bvid), true)
})

test('Bilibili rejects malformed links and lookalike domains without making requests', () => {
  const { utils, requests } = harness()
  for (const input of ['', 'season:abc:123', 'https://evilbilibili.com/list/ml123', 'https://bilibili.com.evil.test/list/ml123', 'https://user:password@www.bilibili.com/list/ml123', 'https://www.bilibili.com/123/channel/collectiondetail', 'file:///list/ml123', 'https://example.com/?fid=123']) {
    assert.throws(() => utils.parseBilibiliListInput(input), /bilibili__error_input/, input)
  }
  assert.equal(requests.length, 0)
})

test('Bilibili resolves short links to durable IDs and prevents foreign redirects', async() => {
  const good = harness(() => ({ statusCode: 302, headers: { location: `https://www.bilibili.com/video/${bvid}` } }))
  assert.equal(await good.utils.resolveBilibiliListId('分享 https://b23.tv/example'), `video:${bvid}`)
  assert.equal(good.requests[0].options.follow_max, 0)
  const bad = harness(() => ({ statusCode: 302, headers: { location: 'https://example.com/list/ml123' } }))
  await assert.rejects(bad.utils.resolveBilibiliListId('https://b23.tv/example'), /bilibili__error_input/)
  assert.equal(bad.requests.length, 1)
  const loop = harness(() => ({ statusCode: 302, headers: { location: 'https://b23.tv/loop' } }))
  await assert.rejects(loop.utils.resolveBilibiliListId('https://b23.tv/loop'), /bilibili__error_input/)
  assert.equal(loop.requests.length, 5)
})

test('Favorites import follows all pages, skips unavailable items and preserves order', async() => {
  const { action, requests } = harness(url => {
    const second = url.searchParams.get('pn') == '2'
    return {
      info: { title: 'Favorites', media_count: 21, cover: '//i0.hdslb.com/fav.jpg', upper: { name: 'Owner' } },
      has_more: !second,
      medias: second ? [{ bvid: 'BV1Q541167Qg', title: 'Last', type: 2 }] : [
        { bvid, title: 'First', type: 2, duration: 123, upper: { name: 'Uploader' } },
        { bvid: 'BV1xx411c7mD', title: '视频已失效', type: 2 },
        { bvid: 'BV1xx411c7mE', title: 'Not a video', type: 12 },
        { title: 'Missing BV ID', type: 2 },
      ],
    }
  })
  const list = await action.getListDetailAll('fav:123', 'bili')
  assert.equal(list.length, 2)
  assert.equal(list[0].name, 'First')
  assert.equal(list[0].singer, '')
  assert.equal(list[0].meta.bilibili.uploader, 'Uploader')
  assert.equal(list[0].meta.bilibili.rawTitle, 'First')
  assert.equal(list[0].interval, '02:03')
  assert.equal(list[1].name, 'Last')
  assert.equal(requests.length, 2)
  assert.equal(new URL(requests[1].url).searchParams.get('pn'), '2')
  assert.equal(list[0].source, 'bili')
})

test('An empty favorites folder returns a successful empty list', async() => {
  const { action } = harness(() => ({ info: { title: 'Empty', media_count: 0 }, medias: null, has_more: false }))
  const list = await action.getListDetailAll('fav:123', 'bili')
  assert.equal(list.length, 0)
})

test('A failed later page aborts refresh and preserves the existing local playlist', async() => {
  const { action } = harness(url => url.searchParams.get('pn') == '2'
    ? { statusCode: 503, body: null }
    : { info: { title: 'Favorites', media_count: 21 }, medias: [{ bvid, title: 'First' }], has_more: true })
  let overwritten = false
  const statuses = []
  const sync = load('src/renderer/store/list/syncSourceList.ts', {
    '@renderer/utils/data': { setListUpdateTime: async() => { throw new Error('Should not update timestamp') } },
    './action': { setFetchingListStatus: (_id, status) => statuses.push(status), overwriteListMusics: async() => { overwritten = true }, setUpdateTime() {} },
    '@renderer/store/songList/action': action,
    '@renderer/store/leaderboard/action': {},
    '@common/utils/common': { dateFormat: () => '' },
  }).default
  await assert.rejects(sync({ id: 'local-list', source: 'bili', sourceListId: 'fav:123' }), /bilibili__error_request/)
  assert.equal(overwritten, false)
  assert.deepEqual(statuses, [true, false])
})

test('Multi-part videos survive conversion, JSON persistence and full-list deduplication', async() => {
  const { action, sdk } = harness(() => video)
  const list = await action.getListDetailAll(`video:${bvid}`, 'bili')
  assert.equal(list.length, 23)
  assert.equal(new Set(list.map(item => item.id)).size, 23)
  assert.equal(list[20].name, 'Track 21')
  assert.equal(list[20].meta.albumName, video.title)
  const restored = tools.toOldMusicInfo(JSON.parse(JSON.stringify(list[20])))
  assert.equal(restored.songmid, `${bvid}_21`)
  assert.equal(restored.bilibili.rawTitle, 'Track 21')
  assert.equal(restored.bilibili.uploader, 'Uploader')
  assert.equal(sdk.getMusicDetailPageUrl(restored), `https://www.bilibili.com/video/${bvid}?p=21`)
})

test('Collections and series map their page parameters and metadata correctly', async() => {
  for (const type of ['season', 'series']) {
    const { action, requests } = harness(url => {
      const meta = { name: 'Collection', total: 21, cover: '//i0.hdslb.com/cover.jpg' }
      if (url.pathname == '/x/series/series') return { meta }
      const pn = url.searchParams.get(type == 'season' ? 'page_num' : 'pn')
      return { meta, page: { total: 21 }, archives: [{ bvid: pn == '1' ? bvid : 'BV1Q541167Qg', title: `Page ${pn}`, duration: 120 }] }
    })
    const list = await action.getListDetailAll(`${type}:99:123`, 'bili')
    assert.equal(list.length, 2)
    assert.equal(list[1].name, 'Page 2')
    const pages = requests.filter(item => new URL(item.url).pathname.endsWith(type == 'season' ? 'seasons_archives_list' : '/archives'))
    assert.equal(pages.length, 2)
    assert.equal(new URL(pages[1].url).searchParams.get(type == 'season' ? 'page_size' : 'ps'), '20')
  }
})

test('Playback requests the saved part and selects the best available AAC audio', async() => {
  const { sdk, requests } = harness(url => url.pathname.endsWith('/view') ? video : {
    dash: {
      audio: [
        { bandwidth: 64000, mimeType: 'audio/mp4', baseUrl: 'https://cdn.bilivideo.com/low.m4s' },
        { bandwidth: 192000, mime_type: 'audio/mp4', base_url: 'https://cdn.bilivideo.com/high.m4s' },
        { bandwidth: 999999, mimeType: 'audio/webm', baseUrl: 'https://cdn.bilivideo.com/unsupported.webm' },
      ],
    },
  })
  const result = await sdk.getMusicUrl({ songmid: `${bvid}_21` }).promise
  assert.equal(result.url, 'https://cdn.bilivideo.com/high.m4s')
  assert.equal(new URL(requests[1].url).searchParams.get('cid'), '120')
  assert.equal(requests[1].options.headers.Referer, 'https://www.bilibili.com/')
})

test('Missing parts and video-only streams fail without playing a different part', async() => {
  const missing = harness(() => video)
  await assert.rejects(missing.sdk.getMusicUrl({ songmid: `${bvid}_999` }).promise, /bilibili__error_missing/)
  assert.equal(missing.requests.length, 1)
  const videoOnly = harness(url => url.pathname.endsWith('/view') ? video : { durl: [{ url: 'https://cdn.bilivideo.com/video.flv' }], dash: { audio: null } })
  await assert.rejects(videoOnly.sdk.getMusicUrl({ songmid: `${bvid}_1` }).promise, /bilibili__error_audio/)
})

test('Bilibili prefers the regular HTTPS CDN backup over regional and PCDN edges', async() => {
  for (const baseUrl of ['https://cn-regional.bilivideo.com/audio.m4s', 'https://peer.mcdn.bilivideo.cn/audio.m4s']) {
    const { sdk } = harness(url => url.pathname.endsWith('/view') ? video : {
      dash: { audio: [{ bandwidth: 192000, baseUrl, backupUrl: ['http://upos-sz-mirrorcos.bilivideo.com/audio.m4s', 'https://upos-sz-mirrorcos.bilivideo.com/audio.m4s'] }] },
    })
    assert.equal((await sdk.getMusicUrl({ songmid: `${bvid}_1` }).promise).url, 'https://upos-sz-mirrorcos.bilivideo.com/audio.m4s')
  }
})

test('Bilibili refreshes expiring media addresses without reading or persisting the generic URL cache', async() => {
  let fetched = 0
  const online = load('src/renderer/core/music/online.ts', {
    './bilibili': {},
    '@renderer/store/list/action': {},
    '@renderer/store/setting': { appSetting: { 'player.playQuality': '128k' } },
    '@renderer/utils/ipc': {
      getMusicUrl: async() => { throw new Error('Should not read an expiring Bilibili URL from disk') },
      saveMusicUrl: () => { throw new Error('Should not persist an expiring Bilibili URL') },
    },
    './utils': {
      getPlayQuality: () => '128k',
      handleGetOnlineMusicUrl: async({ musicInfo }) => ({ url: `https://upos-sz-mirrorcos.bilivideo.com/fresh-${++fetched}.m4s`, quality: '128k', musicInfo, isFromCache: false }),
    },
  })
  const musicInfo = tools.toNewMusicInfo({ songmid: `${bvid}_1`, source: 'bili', name: 'Track', _types: { '128k': {} } })
  assert.notEqual(await online.getMusicUrl({ musicInfo, isRefresh: false }), await online.getMusicUrl({ musicInfo, isRefresh: false }))
  assert.equal(fetched, 2)
})

const catalogueSong = (source, overrides = {}) => ({
  source,
  songmid: `${source}-song`,
  name: '富士山下',
  singer: '陈奕迅',
  interval: '04:19',
  albumName: 'What\'s Going On...?',
  types: [],
  _types: {},
  ...overrides,
})
const bilibiliSong = (overrides = {}) => tools.toNewMusicInfo({
  source: 'bili',
  songmid: `${bvid}_5`,
  name: '富士山下',
  singer: '账号已注销',
  interval: '04:20',
  albumName: '100首中文歌曲合集',
  types: [],
  _types: {},
  ...overrides,
})

test('Bilibili extracts song and performer hints without substituting the uploader', () => {
  for (const [raw, name, singer] of [
    ['001.周杰伦-晴天', '晴天', '周杰伦'],
    ['【4K60FPS】陈奕迅《富士山下》', '富士山下', '陈奕迅'],
    ['【高音质】陈奕迅 - 富士山下', '富士山下', '陈奕迅'],
    ['P03. 富士山下', '富士山下', ''],
    ['晴天', '晴天', ''],
  ]) {
    const result = trackMetadata.parseTrackMetadata(raw)
    assert.equal(result.name, name)
    assert.equal(result.singer, singer)
  }
  assert.equal(trackMetadata.parseTrackMetadata('晴天', '【周杰伦歌曲合集】').singer, '周杰伦')
  assert.equal(trackMetadata.parseTrackMetadata('晴天', '【高音质 值得单曲循环播放的100首中文歌曲合集】').singer, '')
})

test('Bilibili lyric matching ignores uploader and collection title, groups catalogue duplicates and checks duration', () => {
  const info = bilibiliSong()
  const selected = trackMetadata.rankLyricCandidates(info, [
    { list: [catalogueSong('tx'), catalogueSong('tx', { songmid: 'duplicate' }), catalogueSong('tx', { name: '爱情转移', interval: '04:20' })] },
    { list: [catalogueSong('wy', { interval: '04:18' }), catalogueSong('wy', { singer: '阿梨粤', interval: '04:12', songmid: 'cover' }), catalogueSong('wy', { singer: 'Echo Lab', interval: '04:18', songmid: 'same-duration-cover' })] },
  ])
  assert.equal(selected.length, 3)
  assert.ok(selected.every(item => item.singer == '陈奕迅'))
  assert.equal(info.singer, '账号已注销', 'Ranking does not mutate input data')
})

test('Bilibili refuses ambiguous names, single-provider guesses, wrong versions and mismatched durations', () => {
  const info = bilibiliSong()
  assert.equal(trackMetadata.rankLyricCandidates(info, [{ list: [catalogueSong('tx')] }]).length, 0)
  const ambiguous = ['tx', 'wy'].map(source => ({ list: [catalogueSong(source), catalogueSong(source, { singer: '另一位歌手', songmid: 'cover' })] }))
  assert.equal(trackMetadata.rankLyricCandidates(info, ambiguous).length, 0)
  for (const name of ['富士山下 (Live)', '富士山下 (DJ Remix)', '富士山下 (伴奏)']) {
    assert.equal(trackMetadata.rankLyricCandidates(info, ['tx', 'wy'].map(source => ({ list: [catalogueSong(source, { name })] }))).length, 0)
  }
  assert.equal(trackMetadata.rankLyricCandidates(info, ['tx', 'wy'].map(source => ({ list: [catalogueSong(source, { interval: '03:20' })] }))).length, 0)
})

test('Bilibili resolves reversed title/artist order and retains the requested live version', () => {
  const reversed = bilibiliSong({ name: '富士山下 - 陈奕迅' })
  assert.equal(trackMetadata.rankLyricCandidates(reversed, [{ list: [catalogueSong('tx')] }])[0].singer, '陈奕迅')
  const live = bilibiliSong({ name: '陈奕迅《富士山下》Live', interval: '04:58' })
  const selected = trackMetadata.rankLyricCandidates(live, [{ list: [catalogueSong('tx'), catalogueSong('tx', { name: '富士山下 (Live)', songmid: 'live', interval: '04:58' })] }])
  assert.equal(selected.length, 1)
  assert.equal(selected[0].songmid, 'live')
})

function lyricHarness({ unavailable = [], result = source => [catalogueSong(source)] } = {}) {
  const searches = []
  const lyricRequests = []
  const lyrics = new Map()
  const saved = []
  const sdk = Object.fromEntries(['tx', 'wy', 'kw'].map(source => [source, {
    musicSearch: { async search(query, page, limit) { searches.push({ source, query, page, limit }); return { list: result(source) } } },
    getLyric(info) {
      lyricRequests.push({ source, id: info.songmid })
      return { promise: unavailable.includes(source) ? Promise.reject(new Error('Provider unavailable')) : Promise.resolve({ lyric: '[00:01.00]test lyric', tlyric: '', lxlyric: '', rlyric: '' }) }
    },
  }]))
  const utils = load('src/renderer/core/music/utils.ts', {
    '@renderer/store': {},
    '@renderer/store/utils': {},
    '@renderer/utils/musicSdk': { __esModule: true, default: sdk },
    '@renderer/utils/ipc': { getPlayerLyric: async info => lyrics.get(info.id) ?? { lyric: '' } },
    '@renderer/store/setting': { appSetting: {} },
    '@renderer/utils': tools,
    '@renderer/utils/message': {},
    '@renderer/utils/musicSdk/api-source': {},
  }, { window: { i18n: { t: key => key } } })
  const service = load('src/renderer/core/music/bilibili.ts', {
    '@renderer/utils/musicSdk': { __esModule: true, default: sdk },
    '@common/utils/tools': tools,
    '@renderer/utils/musicSdk/bili/metadata': trackMetadata,
    './utils': utils,
    '@renderer/utils/ipc': { async saveLyric(info, lyric) { saved.push(info.id); lyrics.set(info.id, lyric) } },
  })
  return { service, searches, lyricRequests, lyrics, saved }
}

test('Bilibili upgrades saved uploader metadata, loads timed lyrics and caches by BV plus part without changing audio identity', async() => {
  const h = lyricHarness()
  const info = bilibiliSong()
  const updates = []
  const args = { musicInfo: info, isRefresh: false, onToggleSource() {}, onMetadata: value => updates.push(value.singer) }
  const lyric = await h.service.getBilibiliLyricInfo(args)
  assert.match(lyric.lyric, /\[00:01.00\]/)
  assert.equal(info.name, '富士山下')
  assert.equal(info.singer, '陈奕迅')
  assert.equal(info.source, 'bili')
  assert.equal(info.id, `bili_${bvid}_5`)
  assert.equal(info.meta.bilibili.uploader, '账号已注销')
  assert.equal(info.meta.albumName, '100首中文歌曲合集')
  assert.deepEqual(updates, ['', '陈奕迅'])
  assert.equal(h.searches.length, 2)
  assert.ok(h.searches.every(item => item.query == '富士山下' && item.limit == 25))
  assert.ok(h.saved.includes(info.id))
  assert.ok(h.saved.includes(info.meta.bilibili.matchedMusic.id))
  const restored = tools.toNewMusicInfo(tools.toOldMusicInfo(JSON.parse(JSON.stringify(info))))
  assert.equal(restored.meta.bilibili.matchedMusic.singer, '陈奕迅')
  await h.service.getBilibiliLyricInfo({ ...args, musicInfo: restored })
  assert.equal(h.searches.length, 2, 'Cached replay does not search the catalogue again')
  assert.equal(h.lyricRequests.length, 1)
})

test('Bilibili falls back to another lyric provider while keeping the original video', async() => {
  const h = lyricHarness({ unavailable: ['tx'] })
  const info = bilibiliSong()
  const lyric = await h.service.getBilibiliLyricInfo({ musicInfo: info, isRefresh: false, onToggleSource() {} })
  assert.match(lyric.lyric, /\[00:01.00\]/)
  assert.deepEqual(h.lyricRequests.map(item => item.source), ['tx', 'wy'])
  assert.equal(info.meta.bilibili.matchedMusic.source, 'wy')
  assert.equal(info.meta.songId, `${bvid}_5`)
})

test('Bilibili coalesces concurrent searches and an explicit refresh bypasses both caches', async() => {
  const h = lyricHarness()
  const args = { isRefresh: false, onToggleSource() {} }
  await Promise.all([h.service.getBilibiliLyricInfo({ ...args, musicInfo: bilibiliSong() }), h.service.getBilibiliLyricInfo({ ...args, musicInfo: bilibiliSong() })])
  assert.equal(h.searches.length, 2)
  await h.service.getBilibiliLyricInfo({ ...args, isRefresh: true, musicInfo: bilibiliSong() })
  assert.equal(h.searches.length, 4)
})

test('Bilibili list artist matching uses two catalogues, shares playback cache and never fetches audio or lyrics', async() => {
  const h = lyricHarness()
  const original = bilibiliSong()
  const resolved = await h.service.resolveBilibiliMetadata(original)
  assert.equal(resolved.singer, '陈奕迅')
  assert.equal(original.singer, '账号已注销', 'A late result cannot mutate an entry after leaving a list')
  assert.equal(original.meta.bilibili, undefined)
  assert.equal(resolved.id, original.id)
  assert.equal(resolved.meta.bilibili.uploader, '账号已注销')
  assert.deepEqual(h.searches.map(item => item.source), ['tx', 'wy'])
  assert.equal(h.lyricRequests.length, 0)
  assert.equal(h.saved.length, 0)
  await h.service.resolveBilibiliMetadata(bilibiliSong())
  assert.equal(h.searches.length, 2)
  await h.service.getBilibiliLyricInfo({ musicInfo: resolved, isRefresh: false, onToggleSource() {} })
  assert.equal(h.searches.length, 2)
  assert.equal(h.lyricRequests.length, 1)
})

test('Bilibili contacts the third catalogue only when the initial two cannot confirm an artist', async() => {
  const h = lyricHarness({ result: source => source == 'wy' ? [] : [catalogueSong(source)] })
  const info = await h.service.resolveBilibiliMetadata(bilibiliSong())
  assert.equal(info.singer, '陈奕迅')
  assert.deepEqual(h.searches.map(item => item.source), ['tx', 'wy', 'kw'])
})

test('Visible Bilibili artist updates refresh the detail table and cache without losing selected entry identities', async() => {
  const h = harness(() => video)
  await h.action.getAndSetListDetail(`video:${bvid}`, 'bili', 1)
  const entry = h.listDetailInfo.list[0]
  const previousArray = h.listDetailInfo.list
  const updated = { ...entry, singer: 'Artist', meta: { ...entry.meta, bilibili: { ...entry.meta.bilibili, matchedMusic: tools.toNewMusicInfo(catalogueSong('tx')) } } }
  h.action.updateListDetailMusicInfo(updated)
  assert.equal(h.listDetailInfo.list[0], entry)
  assert.notEqual(h.listDetailInfo.list, previousArray)
  assert.equal(h.listDetailInfo.list[0].singer, 'Artist')
  const cached = await h.action.getListDetail(`video:${bvid}`, 'bili', 1)
  assert.equal(cached.list[0].singer, 'Artist')
  assert.equal(h.requests.length, 1)
  h.action.updateListDetailMusicInfo({ ...updated, id: 'another-list-entry' })
  assert.equal(h.listDetailInfo.list[0].singer, 'Artist')
})

test('Bilibili list metadata queue limits concurrency, coalesces duplicates and cancels invisible queued rows', async() => {
  const { createBilibiliMetadataQueue } = load('src/renderer/core/music/bilibiliMetadataQueue.ts', { './bilibili': {}, '@renderer/utils/musicSdk/bili/metadata': trackMetadata })
  const gates = new Map()
  const called = []
  const completed = []
  let active = 0
  let maximum = 0
  const request = createBilibiliMetadataQueue(async info => {
    called.push(info.id)
    maximum = Math.max(maximum, ++active)
    return new Promise((resolve, reject) => gates.set(info.id, { resolve, reject })).finally(() => { active-- })
  }, 0)
  const track = id => ({ ...bilibiliSong(), id })
  const cancelFirst = request(track('one'), () => completed.push('cancelled-first'))
  request(track('two'), () => completed.push('two'))
  request(track('two'), () => completed.push('two-duplicate'))
  const cancelThird = request(track('three'), () => completed.push('cancelled-third'))
  request(track('four'), result => completed.push(result ? 'four' : 'four-failed'))
  cancelThird()
  cancelThird()
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.deepEqual(called, ['one', 'two'])
  cancelFirst()
  gates.get('one').resolve(track('one'))
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(called, ['one', 'two', 'four'])
  gates.get('two').resolve(track('two'))
  gates.get('four').reject(new Error('Network failed'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(maximum, 2)
  assert.deepEqual(completed, ['two', 'two-duplicate', 'four-failed'])
})

test('Bilibili visible artists stop queuing when hidden or unmounted and never query known artists or other sources', () => {
  const watchers = []
  const mounted = []
  const unmounted = []
  const pending = []
  const resolved = []
  const listeners = new Map()
  const document = { hidden: false, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) }
  let observer
  const useArtists = load('src/renderer/utils/compositions/useBilibiliArtists.ts', {
    '@common/utils/vueTools': {
      ref: value => ({ value }),
      watch(get, callback, options) { const watcher = { get, callback, value: get() }; watchers.push(watcher); if (options?.immediate) callback(watcher.value) },
      onMounted: callback => mounted.push(callback),
      onBeforeUnmount: callback => unmounted.push(callback),
    },
    '@renderer/utils/musicSdk/bili/metadata': trackMetadata,
    '@renderer/core/music/bilibiliMetadataQueue': {
      requestBilibiliMetadata(info, callback) { const job = { info, callback, cancelled: false }; pending.push(job); return () => { job.cancelled = true } },
    },
  }, {
    document,
    window: { i18n: { t: key => key } },
    IntersectionObserver: class { constructor(callback) { observer = this; this.callback = callback } observe() {} disconnect() {} },
  }).default
  const first = bilibiliSong()
  const second = { ...bilibiliSong(), id: 'second' }
  const known = { ...bilibiliSong(), id: 'known', singer: '陈奕迅', meta: { ...first.meta, bilibili: { rawTitle: '陈奕迅《富士山下》', uploader: 'Uploader' } } }
  const otherSource = tools.toNewMusicInfo(catalogueSong('tx'))
  const offscreen = { ...bilibiliSong(), id: 'offscreen' }
  const listRef = { value: { views: [first, second, known, otherSource, offscreen].map((item, index) => ({ item, index })), itemHeight: 50, dom_scrollContainer: { scrollTop: 0, clientHeight: 200 } } }
  const getArtist = useArtists(listRef, info => resolved.push(info))
  mounted.forEach(callback => callback())
  assert.equal(pending.length, 0, 'A hidden list does not start searches')
  observer.callback([{ isIntersecting: true }])
  assert.deepEqual(pending.map(job => job.info.id), [first.id, second.id])
  assert.equal(getArtist(known), '陈奕迅')
  assert.equal(getArtist(first), 'bilibili__artist_loading')
  listRef.value.views = [{ item: first, index: 0 }, { item: known, index: 1 }]
  for (const watcher of watchers) {
    const value = watcher.get()
    if (value !== watcher.value) { watcher.value = value; watcher.callback(value) }
  }
  assert.equal(pending[1].cancelled, true)
  document.hidden = true
  listeners.get('visibilitychange')()
  assert.equal(pending[0].cancelled, true)
  document.hidden = false
  listeners.get('visibilitychange')()
  assert.equal(pending.length, 3)
  pending[2].callback({ ...first, singer: '陈奕迅' })
  assert.equal(getArtist(first), '陈奕迅')
  assert.equal(resolved.length, 1)
  const missing = { ...bilibiliSong(), id: 'missing' }
  const triggerWatchers = () => {
    for (const watcher of watchers) {
      const value = watcher.get()
      if (value !== watcher.value) { watcher.value = value; watcher.callback(value) }
    }
  }
  listRef.value.views = [{ item: missing, index: 0 }]
  triggerWatchers()
  pending[3].callback(null)
  assert.equal(getArtist(missing), 'unknown_singer')
  listRef.value.views = [{ item: { ...missing, meta: { ...missing.meta, bilibili: { rawTitle: missing.name, uploader: missing.singer } } }, index: 0 }]
  triggerWatchers()
  assert.equal(pending.length, 4, 'Persisting or refreshing an unknown result cannot create a repeated query/write loop')
  unmounted.forEach(callback => callback())
  pending[2].callback({ ...first, singer: 'late result' })
  assert.equal(resolved.length, 1)
  assert.equal(listeners.size, 0)
})

test('Bilibili retains unknown performer when catalogue evidence is ambiguous and temporarily caches the miss', async() => {
  const h = lyricHarness({ result: source => [catalogueSong(source), catalogueSong(source, { singer: '另一位歌手', songmid: 'other' })] })
  const info = bilibiliSong()
  const args = { musicInfo: info, isRefresh: false, onToggleSource() {} }
  await assert.rejects(h.service.getBilibiliLyricInfo(args), /No confident/)
  assert.equal(info.singer, '')
  assert.equal(info.meta.bilibili.uploader, '账号已注销')
  assert.equal(h.lyricRequests.length, 0)
  await assert.rejects(h.service.getBilibiliLyricInfo(args), /No confident/)
  assert.equal(h.searches.length, 3)
})

test('Saved Bilibili lyrics remain available when artist matching has insufficient evidence', async() => {
  const h = lyricHarness({ result: () => [] })
  const info = bilibiliSong()
  h.lyrics.set(info.id, { lyric: '[00:02.00]saved lyric', tlyric: '', lxlyric: '', rlyric: '' })
  const lyric = await h.service.getBilibiliLyricInfo({ musicInfo: info, isRefresh: false, onToggleSource() {} })
  assert.equal(lyric.lyric, '[00:02.00]saved lyric')
  assert.equal(info.singer, '')
  assert.equal(h.lyricRequests.length, 0)
})

test('Private content, throttling and malformed responses return actionable errors', async() => {
  for (const [statusCode, body, expected] of [
    [200, { code: -101 }, 'private'],
    [200, { code: 72010017 }, 'private'],
    [200, { code: -352 }, 'rate_limit'],
    [412, null, 'rate_limit'],
    [200, { code: -404 }, 'missing'],
    [200, '<html>error</html>', 'request'],
    [200, { code: 0 }, 'request'],
  ]) {
    const { action, listDetailInfo } = harness(() => ({ statusCode, body }))
    await assert.rejects(action.getAndSetListDetail('fav:123', 'bili', 1, true), new RegExp(`bilibili__error_${expected}`))
    assert.equal(listDetailInfo.noItemLabel, `bilibili__error_${expected}`)
  }
})

test('Built-in Bilibili playback works when custom audio sources have not initialized', async() => {
  const musicUtils = load('src/renderer/core/music/utils.ts', {
    '@renderer/store': { qualityList: { value: { bili: ['128k'] } } },
    '@renderer/store/utils': { assertApiSupport: () => true },
    '@renderer/utils/musicSdk': { __esModule: true, default: { bili: { getMusicUrl: () => ({ promise: Promise.resolve({ url: 'https://cdn.bilivideo.com/audio.m4s', type: '128k' }) }) } } },
    '@renderer/utils/ipc': {},
    '@renderer/store/setting': { appSetting: { 'player.playQuality': 'flac' } },
    '@renderer/utils': tools,
    '@renderer/utils/message': { requestMsg: {} },
    '@renderer/utils/musicSdk/api-source': {},
  }, { window: { lx: { apiInitPromise: [Promise.resolve(false)] } } })
  const musicInfo = tools.toNewMusicInfo({ songmid: `${bvid}_1`, source: 'bili', name: 'Track', _types: { '128k': {} } })
  const result = await musicUtils.handleGetOnlineMusicUrl({ musicInfo, allowToggleSource: false, onToggleSource() {}, isRefresh: true })
  assert.equal(result.url, 'https://cdn.bilivideo.com/audio.m4s')
})

test('Bilibili media headers are limited to the actual media and image domains', () => {
  for (const url of ['https://cdn.bilivideo.com/audio.m4s', 'https://mcdn.bilivideo.cn:4483/audio.m4s', 'http://i0.hdslb.com/cover.jpg']) {
    assert.equal(mediaHeaders.getBilibiliMediaHeaders(url).Referer, 'https://www.bilibili.com/')
  }
  for (const url of ['https://example.com/audio.mp3', 'https://bilivideo.com.evil.test/audio.m4s', 'https://evilbilivideo.com/audio.m4s', 'file:///cover.jpg']) {
    assert.equal(Object.keys(mediaHeaders.getBilibiliMediaHeaders(url)).length, 0)
  }
})

test('Bilibili downloads retain the audio container extension', () => {
  const downloadUtils = load('src/renderer/worker/download/utils.ts', {
    '@common/constants': { DOWNLOAD_STATUS: { WAITING: 'waiting' }, QUALITYS: ['flac24bit', 'flac', '320k', '128k'] },
    '@common/utils/common': { filterFileName: value => value },
    '@common/utils/tools': tools,
    './lrcTool': {},
  })
  const musicInfo = tools.toNewMusicInfo({ songmid: `${bvid}_1`, source: 'bili', name: 'Track', singer: 'Uploader', _types: { '128k': {} } })
  const task = downloadUtils.createDownloadInfo(musicInfo, 'flac', '歌手 - 歌名', { bili: ['128k'] })
  assert.equal(task.metadata.ext, 'm4a')
  assert.equal(task.metadata.fileName, 'Uploader - Track.m4a')
  assert.equal(task.metadata.quality, '128k')
})

const discoveryVideo = (id = bvid, parts = 3) => ({ ...video, bvid: id, owner: { name: 'Uploader', mid: 99 }, stat: { view: 12000 }, pages: video.pages.slice(0, parts) })

test('Bilibili discovery shows multi-part videos and deduplicated collections, without treating single videos as playlists', async() => {
  const { discovery, requests } = harness(url => {
    if (url.pathname.endsWith('/spi')) return { b_3: 'guest-one', b_4: 'guest-two' }
    if (url.pathname.endsWith('/type')) return { numPages: 4, result: [bvid, 'BV1Q541167Qg', 'BV1xx411c7mD', 'BV1xx411c7mE'].map(bvid => ({ bvid })) }
    const id = url.searchParams.get('bvid')
    if (id == bvid) return discoveryVideo()
    if (id == 'BV1Q541167Qg') return discoveryVideo(id, 1)
    return { ...discoveryVideo(id, 1), ugc_season: { id: 123, mid: 99, title: 'Same collection', cover: '//i0.hdslb.com/season.jpg', sections: [{ episodes: [{}, {}] }] } }
  })
  const result = await discovery.discoverPlaylists()
  assert.deepEqual(Array.from(result.list, item => item.id), [`video:${bvid}`, 'season:99:123'])
  assert.equal(result.list[1].trackCount, 2)
  assert.equal(result.list[1].img, 'https://i0.hdslb.com/season.jpg')
  assert.equal(result.hasMore, true)
  assert.equal(result.total, 2, 'Do not claim that the video search count is a playlist count')
  assert.equal(requests[1].options.headers.Cookie, 'buvid3=guest-one; buvid4=guest-two')
  assert.equal(requests.some(item => new URL(item.url).pathname.includes('playurl')), false, 'Discovery never preloads audio')
})

test('Discovery uses the selected category and newest sort with at most two concurrent detail requests', async() => {
  let active = 0
  let maximum = 0
  const { discovery } = harness(async url => {
    if (url.pathname.endsWith('/spi')) return { b_3: 'guest-one', b_4: 'guest-two' }
    if (url.pathname.endsWith('/type')) {
      assert.equal(url.searchParams.get('page'), '2')
      assert.equal(url.searchParams.get('order'), 'pubdate')
      assert.match(url.searchParams.get('keyword'), /纯音乐/)
      return { numPages: 2, result: Array.from({ length: 30 }, (_, n) => ({ bvid: 'BV1xx411c7' + n.toString().padStart(2, '0') })) }
    }
    active++
    maximum = Math.max(maximum, active)
    await new Promise(resolve => setImmediate(resolve))
    active--
    return discoveryVideo(url.searchParams.get('bvid'))
  })
  const result = await discovery.discoverPlaylists({ category: 'instrumental', sort: 'new', page: 2 })
  assert.equal(maximum, 2)
  assert.equal(result.list.length, 20)
  assert.equal(result.hasMore, false)
})

test('Discovery caches only bounded batches, expires them on access and supports explicit refresh', async() => {
  let clock = 0
  const subject = harness(url => {
    if (url.pathname.endsWith('/spi')) return { b_3: 'guest-one' }
    if (url.pathname.endsWith('/type')) return { numPages: 1, result: [{ bvid }] }
    return discoveryVideo()
  })
  const discovery = load('src/renderer/utils/musicSdk/bili/discovery.js', { './utils': subject.utils }, { Date: class extends Date { static now() { return clock } } })
  await discovery.discoverPlaylists({ keyword: 'first' })
  const initial = subject.requests.length
  await discovery.discoverPlaylists({ keyword: 'first' })
  assert.equal(subject.requests.length, initial)
  await discovery.discoverPlaylists({ keyword: 'first', refresh: true })
  assert.equal(subject.requests.length, initial + 2)
  for (let i = 0; i < 12; i++) await discovery.discoverPlaylists({ keyword: 'topic-' + i })
  const beforeEviction = subject.requests.length
  await discovery.discoverPlaylists({ keyword: 'first' })
  assert.equal(subject.requests.length, beforeEviction + 1, 'The thirteenth entry evicts the oldest batch but reuses checked video metadata')
  clock += 10 * 60 * 1000 + 1
  await discovery.discoverPlaylists({ keyword: 'first' })
  assert.equal(subject.requests.length, beforeEviction + 3)
  assert.equal(subject.requests.filter(item => new URL(item.url).pathname.endsWith('/spi')).length, 1, 'Reuse the anonymous guest identity')
})

test('Discovery publishes confirmed playlists before a slow final video completes', async() => {
  const ids = [bvid, 'BV1Q541167Qg', 'BV1xx411c7mD']
  let release
  const h = harness(url => {
    if (url.pathname.endsWith('/spi')) return {}
    if (url.pathname.endsWith('/type')) return { numPages: 1, result: ids.map(bvid => ({ bvid })) }
    const id = url.searchParams.get('bvid')
    if (id == ids[2]) return new Promise(resolve => { release = () => resolve(discoveryVideo(id)) })
    return discoveryVideo(id)
  })
  const snapshots = []
  let finished = false
  const pending = h.discovery.discoverPlaylists({ onProgress: result => snapshots.push(result) }).then(result => { finished = true; return result })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(finished, false)
  assert.equal(snapshots.at(-1).list.length, 2, 'The first cards can render while another request is pending')
  release()
  const result = await pending
  assert.deepEqual(Array.from(result.list, item => item.id), ids.map(id => `video:${id}`))
  assert.equal(result.warning, '')
})

test('Discovery reuses positive and single-video checks across categories and refresh revalidates them', async() => {
  const single = 'BV1Q541167Qg'
  const h = harness(url => {
    if (url.pathname.endsWith('/spi')) return {}
    if (url.pathname.endsWith('/type')) return { numPages: 1, result: [{ bvid }, { bvid: single }] }
    const id = url.searchParams.get('bvid')
    return discoveryVideo(id, id == single ? 1 : 3)
  })
  await h.discovery.discoverPlaylists({ category: 'chinese', sort: 'hot' })
  const first = h.requests.length
  await h.discovery.discoverPlaylists({ category: 'japanese', sort: 'new' })
  assert.equal(h.requests.length, first + 1, 'Only the new search is sent; both video checks are cached')
  await h.discovery.discoverPlaylists({ category: 'japanese', sort: 'new', refresh: true })
  assert.equal(h.requests.length, first + 4)
  assert.ok(h.requests.filter(item => new URL(item.url).pathname.endsWith('/view')).every(item => item.options.timeout == 5000))
  assert.ok(h.requests.filter(item => new URL(item.url).pathname.endsWith('/type')).every(item => item.options.timeout == 8000))
})

test('Discovery keeps usable cards on a transient detail failure and retries failed checks on refresh', async() => {
  let failures = 0
  const other = 'BV1Q541167Qg'
  const h = harness(url => {
    if (url.pathname.endsWith('/spi')) return {}
    if (url.pathname.endsWith('/type')) return { numPages: 1, result: [{ bvid }, { bvid: other }] }
    const id = url.searchParams.get('bvid')
    if (id == bvid && failures++ == 0) throw new Error('Slow network')
    return discoveryVideo(id)
  })
  const partial = await h.discovery.discoverPlaylists()
  assert.equal(partial.list.length, 1)
  assert.equal(partial.warning, 'bilibili__partial_results')
  const requests = h.requests.length
  const retried = await h.discovery.discoverPlaylists()
  assert.equal(retried.list.length, 2)
  assert.equal(retried.warning, '')
  assert.equal(h.requests.length, requests + 2, 'Partial batches and transient failures are not cached as complete')
})

test('Discovery stops at its detail time budget and retains already validated cards', async() => {
  let deadline
  let cleared = false
  const other = 'BV1Q541167Qg'
  let slowSignal
  const discovery = load('src/renderer/utils/musicSdk/bili/discovery.js', {
    './utils': {
      getBilibiliData: async path => path.endsWith('/spi') ? {} : { numPages: 1, result: [{ bvid }, { bvid: other }] },
      getVideoInfo: async(id, { signal }) => {
        if (id == bvid) return discoveryVideo(id)
        slowSignal = signal
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
      },
      normalizeImage: value => value,
    },
  }, {
    setTimeout(callback, delay) { assert.equal(delay, 20000); deadline = callback; return 'budget-timer' },
    clearTimeout(timer) { assert.equal(timer, 'budget-timer'); cleared = true },
  })
  const pending = discovery.discoverPlaylists()
  await new Promise(resolve => setImmediate(resolve))
  deadline()
  const result = await pending
  assert.equal(slowSignal.aborted, true)
  assert.equal(result.list.length, 1)
  assert.equal(result.warning, 'bilibili__partial_results')
  assert.equal(cleared, true)
})

test('Discovery preserves validated cards and stops remaining checks when Bilibili rate limits a detail request', async() => {
  const other = 'BV1Q541167Qg'
  const third = 'BV1xx411c7mD'
  const requested = []
  let rejectRateLimit
  const discovery = load('src/renderer/utils/musicSdk/bili/discovery.js', {
    './utils': {
      getBilibiliData: async path => path.endsWith('/spi') ? {} : { numPages: 1, result: [bvid, other, third].map(bvid => ({ bvid })) },
      getVideoInfo: async(id, { signal }) => {
        requested.push(id)
        if (id == bvid) return discoveryVideo(id)
        if (id == other) return new Promise((_resolve, reject) => { rejectRateLimit = () => reject(new Error('bilibili__error_rate_limit')) })
        return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      },
      normalizeImage: value => value,
    },
  })
  const pending = discovery.discoverPlaylists()
  await new Promise(resolve => setImmediate(resolve))
  rejectRateLimit()
  const result = await pending
  assert.equal(result.list.length, 1)
  assert.equal(result.warning, 'bilibili__error_rate_limit')
  assert.equal(requested.length, 3)
})

test('Discovery limits the cross-category video cache to 128 compact playlist records', async() => {
  const h = harness(url => {
    if (url.pathname.endsWith('/spi')) return {}
    if (url.pathname.endsWith('/type')) {
      const index = Number(url.searchParams.get('keyword').split('-').at(-1))
      return { numPages: 1, result: [{ bvid: 'BV1xx411' + String(index).padStart(4, '0') }] }
    }
    return discoveryVideo(url.searchParams.get('bvid'))
  })
  for (let i = 0; i < 129; i++) await h.discovery.discoverPlaylists({ keyword: `topic-${i}` })
  const before = h.requests.length
  await h.discovery.discoverPlaylists({ keyword: 'topic-0' })
  assert.equal(h.requests.length, before + 2)
})

test('Bilibili discovery view renders incremental cards, preserves refresh results and ignores outdated progress', async() => {
  const file = 'src/renderer/views/songList/List/components/BilibiliDiscovery.vue'
  const { parse, compileScript } = require('@vue/compiler-sfc')
  const source = compileScript(parse(fs.readFileSync(path.join(root, file), 'utf8')).descriptor, { id: 'bili-discovery-test' }).content
  const calls = []
  const unmounted = []
  const module = load(file, {
    vue: { defineComponent: value => value },
    '@common/utils/vueTools': {
      ref: value => ({ value }),
      shallowReactive: value => value,
      computed: get => ({ get value() { return get() } }),
      watch() {},
      onBeforeUnmount: callback => unmounted.push(callback),
    },
    '@common/utils/vueRouter': { useRoute: () => ({ path: '/biliMusic/recommend' }), useRouter: () => ({ replace() {} }) },
    '@common/constants': { LIST_IDS: {} },
    '@renderer/utils/musicSdk/bili/discovery': {
      discoveryCategories: [], discoverPlaylists: options => new Promise((resolve, reject) => calls.push({ options, resolve, reject })),
    },
    '@renderer/utils/aiRecommendation': { getRecommendationError: () => 'bilibili__error_request' },
    '@renderer/store/list/listManage': {},
    '@renderer/store/player/state': { playedList: [] },
    '@renderer/store/songList/bilibili': { biliAiSession: { list: [], hint: '', notice: '' }, biliBrowseSession: {} },
    '@renderer/store/songList/state': { listInfo: {} },
    '@renderer/plugins/i18n': { useI18n: () => key => key },
    './SongList.vue': {},
    './AiRecommendationSettings.vue': {},
  }, {}, source)
  const props = { tagId: 'chinese', sortId: 'new', page: 1 }
  const state = module.default.setup(props, { expose() {} })
  const firstCard = { id: 'video:first', source: 'bili', name: 'First' }
  const secondCard = { id: 'video:second', source: 'bili', name: 'Second' }
  const first = state.loadBrowse()
  assert.equal(state.info.noItemLabel, 'list__loading')
  calls[0].options.onProgress({ list: [firstCard], checked: 1, candidates: 20 })
  assert.equal(state.info.list[0].id, firstCard.id)
  assert.equal(state.info.noItemLabel, '')
  assert.equal(state.loading.value, true)
  calls[0].resolve({ list: [firstCard], total: 1, hasMore: true, warning: '' })
  await first
  const refresh = state.loadBrowse(true)
  assert.equal(state.info.list[0].id, firstCard.id, 'Refreshing does not blank usable cards')
  calls[0].options.onProgress({ list: [secondCard] })
  assert.equal(state.info.list[0].id, firstCard.id, 'An outdated progress callback cannot replace the current batch')
  calls[1].options.onProgress({ list: [secondCard] })
  calls[1].reject(new Error('Network disconnected'))
  await refresh
  assert.equal(state.info.list[0].id, secondCard.id)
  assert.equal(state.info.noItemLabel, '')
  assert.equal(state.notice.value, 'bilibili__error_request')
  props.tagId = 'japanese'
  const changed = state.loadBrowse()
  assert.equal(state.info.list.length, 0, 'Another category does not show the previous category results')
  unmounted.forEach(callback => callback())
  calls[2].options.onProgress({ list: [firstCard] })
  calls[2].resolve({ list: [firstCard], total: 1, hasMore: false, warning: '' })
  await changed
  assert.equal(state.info.list.length, 0)
  assert.equal(calls[2].options.signal.aborted, true)
})

test('Discovery cancellation stops scheduling further video details and never caches cancelled results', async() => {
  const controller = new AbortController()
  let details = 0
  const { discovery, requests } = harness(async url => {
    if (url.pathname.endsWith('/spi')) return {}
    if (url.pathname.endsWith('/type')) return { numPages: 2, result: Array.from({ length: 20 }, (_, n) => ({ bvid: 'BV1xx411c7' + n.toString().padStart(2, '0') })) }
    details++
    controller.abort()
    return discoveryVideo()
  })
  await assert.rejects(discovery.discoverPlaylists({ signal: controller.signal }), /bilibili__cancelled/)
  assert.ok(details <= 2, 'Cancelled workers do not start the remaining detail requests')
  const before = requests.length
  await assert.rejects(discovery.discoverPlaylists({ signal: controller.signal }), /bilibili__cancelled/)
  assert.equal(requests.length, before)
  await discovery.discoverPlaylists()
  assert.equal(requests.filter(item => new URL(item.url).pathname.endsWith('/type')).length, 2, 'A cancelled page is not cached')
})

test('Discovery skips missing videos but reports rate limiting and network errors', async() => {
  for (const code of [-404, -352]) {
    const { discovery } = harness(url => {
      if (url.pathname.endsWith('/spi')) return {}
      if (url.pathname.endsWith('/type')) return { numPages: 1, result: [{ bvid }] }
      return { statusCode: 200, body: { code } }
    })
    if (code == -404) assert.equal((await discovery.discoverPlaylists()).list.length, 0)
    else await assert.rejects(discovery.discoverPlaylists(), /bilibili__error_rate_limit/)
  }
  const failed = harness(url => {
    if (url.pathname.endsWith('/spi')) return {}
    if (url.pathname.endsWith('/type')) return { numPages: 1, result: [{ bvid }] }
    throw new Error('Network disconnected')
  })
  await assert.rejects(failed.discovery.discoverPlaylists(), /Network disconnected/)
})

function aiHarness() {
  const handles = new Map()
  const stored = new Map()
  const requests = []
  let respond = async() => ({ statusCode: 200, body: { choices: [{ message: { content: '{"keywords":[{"keyword":"钢琴合集","reason":"安静"}]}' } }] } })
  let encryptionAvailable = true
  const subject = load('src/main/modules/winMain/rendererEvent/aiRecommendation.ts', {
    electron: {
      safeStorage: {
        isEncryptionAvailable: () => encryptionAvailable,
        encryptString: value => Buffer.from('encrypted:' + value),
        decryptString: value => value.toString().slice('encrypted:'.length),
      },
    },
    '@common/constants': { STORE_NAMES: { AI_RECOMMEND: 'synthetic-ai' } },
    '@common/ipcNames': { WIN_MAIN_RENDERER_EVENT_NAME: new Proxy({}, { get: (_, key) => key }) },
    '@common/mainIpc': { mainHandle: (name, handler) => handles.set(name, handler) },
    '@main/utils/store': { __esModule: true, default: () => ({ get: key => stored.get(key), set: (key, value) => stored.set(key, value) }) },
    '@common/utils/request': { request: async(url, options) => { requests.push({ url, options }); return respond(url, options) } },
  })
  subject.default()
  const sender = Object.assign(new EventEmitter(), { id: 7 })
  const invoke = async(name, params = {}, windowSender = sender) => handles.get(name)({ params, event: { sender: windowSender } })
  return {
    subject,
    stored,
    requests,
    sender,
    invoke,
    setResponse(value) { respond = value },
    setEncryption(value) { encryptionAvailable = value },
    configure: async(input = {}) => invoke('ai_recommend_config_set', { baseUrl: 'https://model.example/v1', model: 'test-model', apiKey: 'synthetic-private-key', ...input }),
  }
}

test('AI configuration stays local, encrypts the key and returns no credential to the renderer', async() => {
  const h = aiHarness()
  const config = await h.configure()
  assert.equal(config.configured, true)
  assert.equal(config.hasKey, true)
  assert.equal(config.baseUrl, 'https://model.example/v1/chat/completions')
  assert.equal(JSON.stringify(config).includes('synthetic-private-key'), false)
  assert.equal(h.stored.get('config').encryptedKey, Buffer.from('encrypted:synthetic-private-key').toString('base64'))
  assert.equal(h.requests.length, 0, 'Saving never calls a paid model')
  await h.configure({ apiKey: '' })
  assert.equal((await h.invoke('ai_recommend_config_get')).hasKey, true)
  await h.configure({ baseUrl: 'https://other.example/v1', apiKey: '' })
  assert.equal((await h.invoke('ai_recommend_config_get')).hasKey, false, 'Changing service origin cannot reuse the old key')
  await h.invoke('ai_recommend_config_set', { baseUrl: '', model: '', clearKey: true })
  assert.equal(h.stored.get('config').encryptedKey, '')
})

test('AI supports local compatible endpoints without a key and rejects unsafe or malformed configuration', async() => {
  const h = aiHarness()
  assert.equal((await h.configure({ baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '' })).configured, true)
  for (const url of ['http://remote.example/v1', 'file:///etc/config', 'https://user:password@model.example/v1', 'https://model.example/v1?api_key=secret', 'https://model.example/v1#key']) {
    await assert.rejects(h.configure({ baseUrl: url }), /ai_recommend__error_config/)
  }
  h.setEncryption(false)
  await assert.rejects(h.configure(), /ai_recommend__error_storage/)
})

test('AI plans bounded search intents, limits shared metadata and never enables retries or redirects', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: '```json\n{"keywords":[{"keyword":"钢琴"},{"keyword":"钢琴"},{"keyword":"日系合集"},{"keyword":"extra"}]}\n```' } }] } }))
  const result = await h.invoke('ai_recommend_plan', { jobId: 'plan-one', hint: 'Evening'.repeat(100), seeds: Array.from({ length: 100 }, () => ({ name: 'a'.repeat(300), singer: 'b'.repeat(300) })) })
  assert.deepEqual(Array.from(result, item => item.keyword), ['钢琴 音乐合集', '日系合集'])
  const { url, options } = h.requests[0]
  assert.equal(url, 'https://model.example/v1/chat/completions')
  assert.equal(options.headers.Authorization, 'Bearer synthetic-private-key')
  assert.equal(options.maxRedirect, 0)
  assert.equal(options.retryNum, 0)
  const sent = JSON.parse(options.json.messages[1].content)
  assert.equal(sent.hint.length, 500)
  assert.equal(sent.seeds.length, 40)
  assert.equal(sent.seeds[0].name.length, 120)
  assert.equal(sent.seeds[0].singer.length, 80)
})

test('AI ranking accepts only known real playlist IDs and removes duplicates', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({
    statusCode: 200,
    body: {
      choices: [{
        message: {
          content: JSON.stringify({
            items: [
              { id: 'video:BV1Q541167Qg', reason: 'Fits the mood' },
              { id: 'video:BV1Q541167Qg', reason: 'Duplicate' },
              { id: 'video:BV1xx411c7mD', reason: 'Invented' },
              { id: 'https://example.com', reason: 'Invalid' },
            ],
          }),
        },
      }],
    },
  }))
  const result = await h.invoke('ai_recommend_rank', {
    jobId: 'rank-one',
    hint: 'Piano',
    candidates: [
      { id: `video:${bvid}`, name: 'First', author: 'A', trackCount: 3 },
      { id: 'video:BV1Q541167Qg', name: 'Second', author: 'B', trackCount: 4 },
    ],
  })
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'video:BV1Q541167Qg')
})

test('AI track planning supports three platforms, rejects playlist intents and bounds the requested variety', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ keywords: [{ keyword: '周杰伦 抒情' }, { keyword: '歌曲合集' }, { keyword: '周杰伦 抒情' }, { keyword: '陈绮贞 旅行' }, { keyword: '落日飞车' }, { keyword: 'extra' }] }) } }] } }))
  for (const source of ['tx', 'wy', 'bili']) {
    const intents = await h.invoke('ai_recommend_plan', { jobId: 'tracks', kind: 'tracks', source, variety: 'explore', hint: '夜晚散步', seeds: [] })
    assert.deepEqual(Array.from(intents, item => item.keyword), ['周杰伦 抒情', '陈绮贞 旅行', '落日飞车', 'extra'])
    const sent = JSON.parse(h.requests.at(-1).options.json.messages[1].content)
    assert.equal(sent.source, source)
    assert.equal(sent.variety, 'explore')
  }
  await assert.rejects(h.invoke('ai_recommend_plan', { jobId: 'tracks', kind: 'tracks', source: 'unknown', hint: 'Night' }), /ai_recommend__error_request/)
  assert.equal(h.requests.length, 3)
})

test('AI track ranking accepts only known IDs from the selected platform and sends no audio URLs or credentials', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ items: [{ id: 'wy_2', reason: 'Fits' }, { id: 'wy_2' }, { id: 'wy_999' }, { id: 'tx_3' }] }) } }] } }))
  const ranked = await h.invoke('ai_recommend_rank', {
    jobId: 'tracks',
    kind: 'tracks',
    source: 'wy',
    hint: 'Night',
    trackCandidates: [
      { id: 'wy_1', name: 'First', singer: 'A', albumName: 'One', interval: '03:00', audioUrl: 'secret-url' },
      { id: 'wy_2', name: 'Second', singer: 'B', albumName: 'Two', interval: '04:00', cookie: 'secret-cookie' },
      { id: 'tx_3', name: 'Other platform', singer: 'C' },
    ],
  })
  assert.deepEqual(Array.from(ranked, item => item.id), ['wy_2'])
  const sent = h.requests[0].options.json.messages[1].content
  assert.equal(JSON.parse(sent).candidates.length, 2)
  assert.equal(sent.includes('secret-url'), false)
  assert.equal(sent.includes('secret-cookie'), false)
})

test('AI track plans use bounded weighted taste and complementary verified-song/artist directions', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ keywords: [
    { kind: 'track', name: 'Owned', singer: 'A' },
    { kind: 'track', name: 'First', singer: 'A' },
    { kind: 'track', name: 'Second', singer: 'A' },
    { kind: 'track', name: 'Third', singer: 'A' },
    { kind: 'track', name: 'First', singer: ' a ' },
    { kind: 'track', name: 'Fourth', singer: 'B' },
    { kind: 'track', name: 'Fifth', singer: 'C' },
    { kind: 'track', name: 'Sixth', singer: 'D' },
    { kind: 'artist', keyword: 'A' },
    { kind: 'artist', keyword: 'Artist B' },
    { kind: 'discovery', keyword: '安静 器乐' },
    { kind: 'discovery', keyword: 'Extra direction' },
  ] }) } }] } }))
  const seeds = [null, { name: 'Owned', singer: 'A', basis: 'repeat', weight: 4, audioUrl: 'secret-audio' }, ...Array.from({ length: 60 }, (_, index) => ({ name: 'Seed' + index, singer: 'Singer' + index, basis: 'invalid', weight: -1 }))]
  const intents = await h.invoke('ai_recommend_plan', {
    jobId: 'structured', kind: 'tracks', source: 'tx', variety: 'explore', hint: '静心', seeds,
    recentSeeds: Array.from({ length: 20 }, () => ({ name: 'Recent', singer: 'R', sessionId: 'secret-session' })),
    avoidedSeeds: Array.from({ length: 20 }, () => ({ name: 'Avoided', singer: 'S', cookie: 'secret-cookie' })),
  })
  assert.equal(intents.length, 6)
  assert.deepEqual(Array.from(intents, intent => intent.keyword), ['First A', 'Second A', 'Fourth B', 'Fifth C', 'Artist B', '安静 器乐'])
  assert.equal(intents[0].target.name, 'First')
  const sentText = h.requests[0].options.json.messages[1].content
  const sent = JSON.parse(sentText)
  assert.equal(sent.seeds.length, 24)
  assert.equal(sent.seeds[0].basis, 'repeat')
  assert.equal(sent.seeds[0].weight, 1)
  assert.equal(sent.seeds[1].weight, 0)
  assert.equal(sent.seeds[1].basis, undefined)
  assert.equal(sent.recentSeeds.length, 6)
  assert.equal(sent.avoidedSeeds.length, 6)
  assert.equal(sentText.includes('secret-'), false)
  assert.equal(h.requests.length, 1)
})

test('An exact-song-only AI plan retains bounded artist searches instead of yielding only a few singles', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ keywords: Array.from({ length: 8 }, (_, index) => ({ kind: 'track', name: 'Song' + index, singer: 'Artist' + index })) }) } }] } }))
  const intents = await h.invoke('ai_recommend_plan', { jobId: 'exact-only', kind: 'tracks', source: 'wy', hint: '夜晚' })
  assert.equal(intents.length, 6)
  assert.equal(intents.filter(intent => intent.kind == 'track').length, 4)
  assert.deepEqual(Array.from(intents.filter(intent => intent.kind == 'artist'), intent => intent.keyword), ['Artist0', 'Artist1'])
})

test('A single-artist AI request retains discovery capacity within its two-direction limit', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ keywords: [
    { kind: 'track', name: 'One', singer: 'Artist' }, { kind: 'track', name: 'Two', singer: 'Artist' }, { kind: 'track', name: 'Three', singer: 'Artist' },
  ] }) } }] } }))
  const intents = await h.invoke('ai_recommend_plan', { jobId: 'one-artist', kind: 'tracks', source: 'tx', hint: '想听Artist的歌' })
  assert.equal(intents.length, 2)
  assert.deepEqual(Array.from(intents, intent => intent.kind), ['track', 'artist'])
  assert.equal(intents[1].keyword, 'Artist')
})

test('AI track exclusions accept only real candidates, override ranking duplicates and cannot return private fields', async() => {
  const h = aiHarness()
  await h.configure()
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({
    items: [{ id: 'wy_1', reason: 'Fit' }, { id: 'wy_2', reason: 'Exclude overrides' }, { id: 'wy_1' }],
    excludedIds: ['wy_2', 'wy_2', 'wy_999', 'tx_1', null],
  }) } }] } }))
  const result = await h.invoke('ai_recommend_rank', { jobId: 'exclusions', kind: 'tracks', source: 'wy', hint: 'Night', trackCandidates: [
    { id: 'wy_1', name: 'One', singer: 'A', albumName: 'Album', interval: '03:00', retrieval: ['Some query', 'Another query'], cookie: 'private-cookie' },
    { id: 'wy_2', name: 'Two', singer: 'B' },
  ] })
  assert.deepEqual(Array.from(result, item => [item.id, item.exclude === true]), [['wy_1', false], ['wy_2', true]])
  assert.deepEqual(JSON.parse(h.requests[0].options.json.messages[1].content).candidates[0].retrieval, ['Some query', 'Another query'])
  assert.equal(JSON.stringify(result).includes('private-cookie'), false)
})

test('AI ranking uses compact request-scoped IDs and restores all forty real songs with bounded scores', async() => {
  const h = aiHarness()
  await h.configure()
  const candidates = Array.from({ length: 40 }, (_, index) => ({ id: 'wy_' + (100 + index), name: 'Song' + index, singer: 'Artist' + index, albumName: 'Album', interval: '03:00' }))
  h.setResponse(async(_url, options) => {
    const input = JSON.parse(options.json.messages[1].content)
    assert.deepEqual(input.candidates.map(item => item.id), candidates.map((_, index) => 'c' + (index + 1)))
    assert.ok(options.json.max_tokens <= 3600)
    return { statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ items: input.candidates.map(item => ({ id: item.id, reason: 'Fits the request', score: 85 })) }) } }] } }
  })
  const ranked = await h.invoke('ai_recommend_rank', { jobId: 'compact', kind: 'tracks', source: 'wy', hint: 'Night', trackCandidates: candidates })
  assert.deepEqual(Array.from(ranked, item => item.id), candidates.map(item => item.id))
  assert.ok(ranked.every(item => item.score == 0.85))
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: JSON.stringify({ items: [{ id: 'c40', score: 99 }, { id: 'c1', score: 500 }, { id: 'c2', score: -10 }], excludedIds: ['c2', 'c99'] }) } }] } }))
  const next = await h.invoke('ai_recommend_rank', { jobId: 'compact-next', kind: 'tracks', source: 'wy', hint: 'Another request', trackCandidates: candidates.slice(10, 12) })
  assert.deepEqual(Array.from(next, item => [item.id, item.score, item.exclude === true]), [['wy_110', 1, false], ['wy_111', undefined, true]])
})

test('AI errors do not expose credentials or provider response bodies', async() => {
  const h = aiHarness()
  await assert.rejects(h.invoke('ai_recommend_plan', { jobId: 'one', hint: 'Piano' }), /ai_recommend__error_config/)
  assert.equal(h.requests.length, 0)
  await h.configure()
  await assert.rejects(h.invoke('ai_recommend_plan', { jobId: 'one', hint: '' }), /ai_recommend__error_preference/)
  h.setResponse(async() => { throw new Error('secret transport error: synthetic-private-key') })
  await assert.rejects(h.invoke('ai_recommend_plan', { jobId: 'one', hint: 'Piano' }), /^Error: ai_recommend__error_request$/)
  h.setResponse(async() => ({ statusCode: 401, body: { error: 'private-key echoed' } }))
  await assert.rejects(h.invoke('ai_recommend_plan', { jobId: 'one', hint: 'Piano' }), /^Error: ai_recommend__error_auth$/)
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: 'not valid JSON' } }] } }))
  await assert.rejects(h.invoke('ai_recommend_plan', { jobId: 'one', hint: 'Piano' }), /ai_recommend__error_response/)
  assert.equal(h.sender.listenerCount('destroyed'), 0)
})

test('AI cancellation is scoped to its job and the owning window and releases the active request', async() => {
  const h = aiHarness()
  await h.configure()
  let signal
  h.setResponse(async(_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }))
  const running = h.invoke('ai_recommend_plan', { jobId: 'cancel-me', hint: 'Piano' })
  await new Promise(resolve => setImmediate(resolve))
  await assert.rejects(h.invoke('ai_recommend_plan', { jobId: 'other', hint: 'Piano' }), /ai_recommend__error_busy/)
  await h.invoke('ai_recommend_cancel', { jobId: 'wrong-job' })
  assert.equal(signal.aborted, false)
  await h.invoke('ai_recommend_cancel', { jobId: 'cancel-me' }, Object.assign(new EventEmitter(), { id: 8 }))
  assert.equal(signal.aborted, false, 'Another window cannot cancel this request')
  await h.invoke('ai_recommend_cancel', { jobId: 'cancel-me' })
  await assert.rejects(running, /ai_recommend__error_cancelled/)
  h.setResponse(async() => ({ statusCode: 200, body: { choices: [{ message: { content: 'pong' } }] } }))
  await h.invoke('ai_recommend_test', { jobId: 'works-again' })
  assert.equal(h.sender.listenerCount('destroyed'), 0)
})

test('Playlist detail list safely ignores a queued frame or resize after navigation unmounts it', () => {
  const mounted = []
  const unmounted = []
  const ticks = []
  const frames = []
  const timers = []
  const listeners = new Map()
  const subject = load('src/renderer/components/base/VirtualizedList.vue', {
    vue: {
      ref: value => ({ value }),
      computed: get => ({ get value() { return get() } }),
      nextTick: callback => { ticks.push(callback); return Promise.resolve() },
      watch() {},
      onMounted: callback => mounted.push(callback),
      onBeforeUnmount: callback => unmounted.push(callback),
    },
  }, {
    requestAnimationFrame: callback => frames.push(callback),
    window: { setTimeout: callback => timers.push(callback), addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) },
  }).default
  const state = subject.setup({ list: [{ id: 'one' }, { id: 'two' }], itemHeight: 30, keyName: 'id' }, { emit() {} })
  state.dom_scrollContainer.value = { scrollTop: 0, clientHeight: 90, addEventListener() {}, removeEventListener() {} }
  mounted.forEach(callback => callback())
  ticks.forEach(callback => callback())
  listeners.get('resize')()
  unmounted.forEach(callback => callback())
  state.dom_scrollContainer.value = null
  assert.doesNotThrow(() => { frames.forEach(callback => callback()); timers.forEach(callback => callback()) })
  assert.equal(listeners.has('resize'), false)
})
