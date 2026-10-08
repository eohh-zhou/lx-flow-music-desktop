const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const { EventEmitter, once } = require('node:events')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const ts = require('typescript')
const WebSocket = require('ws')

const root = path.resolve(__dirname, '..')
const quiet = { log() {}, info() {}, warn() {}, error() {}, r_warn() {} }
const tick = async() => new Promise(resolve => setImmediate(resolve))

// Run the actual source with isolated Electron, storage and provider boundaries.
// The sync tests use real ws handshakes against local HTTP servers.
function loadSource(file, mocks, extra = {}, expose = '') {
  const source = fs.readFileSync(path.join(root, file), 'utf8') + '\n' + expose
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.startsWith('node:')) return require(name)
      throw new Error('Unmocked dependency: ' + name)
    },
    __dirname: path.dirname(path.join(root, file)),
    Buffer,
    URL,
    console: quiet,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    process,
    ...extra,
  }, { filename: file })
  return module.exports
}

function deferred() {
  let resolve, reject
  const promise = new Promise((_resolve, _reject) => { resolve = _resolve; reject = _reject })
  return { promise, resolve, reject }
}

async function withDeadline(promise) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Test timed out')), 3000) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

class FakeWindow extends EventEmitter {
  static fromWebContents() { return null }
  constructor(options) {
    super()
    this.bounds = { x: options.x ?? 0, y: options.y ?? 0, width: options.width, height: options.height }
    this.destroyed = false
    this.webContents = new EventEmitter()
    this.webContents.setWindowOpenHandler = () => {}
    this.webContents.mainFrame = {}
  }

  async loadURL() {}
  setBounds(bounds) {
    const previous = this.bounds
    this.bounds = { ...previous, ...bounds }
    if (previous.x !== this.bounds.x || previous.y !== this.bounds.y) this.emit('move')
    if (previous.width !== this.bounds.width || previous.height !== this.bounds.height) this.emit('resize')
  }

  getBounds() { return { ...this.bounds } }
  close() { this.destroyed = true; this.emit('closed') }
  isDestroyed() { return this.destroyed }
  show() {}
  focus() {}
  blur() {}
  setMaximumSize() {}
  setAlwaysOnTop() {}
  setIgnoreMouseEvents() {}
  setResizable() {}
  setSkipTaskbar() {}
}

function createNeteaseHarness() {
  const cookies = new EventEmitter()
  let cookieRows = [{ name: 'MUSIC_A', value: 'synthetic-guest', domain: '.music.163.com' }]
  cookies.get = async() => cookieRows
  const authSession = { cookies, clearStorageData: async() => {} }
  const stored = new Map()
  const handles = new Map()
  const windows = []
  const requests = []
  let respond = async() => ({ code: 200, account: { id: 12345 } })
  let loadPage = async() => { cookies.emit('changed') }
  class LoginWindow extends FakeWindow {
    constructor(options) { super(options); windows.push(this) }
    async loadURL() { await loadPage() }
  }
  const subject = loadSource('src/main/modules/winMain/rendererEvent/neteaseMusic.ts', {
    electron: {
      BrowserWindow: LoginWindow,
      session: { fromPartition: () => authSession },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: text => Buffer.from(text),
        decryptString: buffer => buffer.toString(),
      },
    },
    '@common/ipcNames': { WIN_MAIN_RENDERER_EVENT_NAME: new Proxy({}, { get: (_target, key) => key }) },
    '@common/mainIpc': { mainHandle: (name, handler) => handles.set(name, handler) },
    '@common/utils/request': {
      request: async(url, options) => {
        requests.push({ url, options })
        return { statusCode: 200, body: await respond(url, options) }
      },
    },
    '@common/constants': { STORE_NAMES: { NETEASE_MUSIC: 'synthetic-store' } },
    '@main/utils/store': { __esModule: true, default: () => ({ get: key => stored.get(key), set: (key, value) => stored.set(key, value) }) },
    '../../../../renderer/utils/musicSdk/wy/utils/crypto': { weapi: value => value },
  })
  subject.default()
  return {
    windows,
    requests,
    stored,
    start: () => handles.get('netease_music_login')({ event: { sender: {} } }),
    status: () => handles.get('netease_music_status')(),
    daily: () => handles.get('netease_music_daily_recommend')(),
    setCookieRows(rows) { cookieRows = rows; cookies.emit('changed') },
    setResponse(callback) { respond = callback },
    setPageLoad(callback) { loadPage = callback },
  }
}

const authenticatedCookie = [{ name: 'MUSIC_U', value: 'synthetic-account-token', domain: '.music.163.com' }]

test('NetEase guest cookie keeps the login window open until an account is verified', async() => {
  const harness = createNeteaseHarness()
  const login = harness.start()
  let settled = false
  login.then(() => { settled = true })
  await tick()
  assert.equal(settled, false)
  assert.equal(harness.windows[0].destroyed, false)
  assert.equal(harness.stored.has('cookie'), false)
  assert.equal(harness.requests.length, 0)
  harness.setCookieRows(authenticatedCookie)
  assert.equal((await withDeadline(login)).configured, true)
  assert.equal(harness.windows[0].destroyed, true)
  assert.equal(harness.requests.length, 1)
  assert.match(harness.requests[0].options.headers.Cookie, /MUSIC_U=synthetic-account-token/)
  assert.equal((await harness.status()).configured, true)
})

test('NetEase account-less response does not save cookies and can retry', async() => {
  const harness = createNeteaseHarness()
  harness.setResponse(async() => ({ code: 200, account: { id: 0 } }))
  const login = harness.start()
  harness.setCookieRows(authenticatedCookie)
  await tick()
  assert.equal(harness.windows[0].destroyed, false)
  assert.equal(harness.stored.has('cookie'), false)
  harness.setResponse(async() => ({ code: 200, data: { profile: { userId: 54321 } } }))
  harness.setCookieRows(authenticatedCookie)
  assert.equal((await withDeadline(login)).configured, true)
})

test('NetEase cookies from a cancelled window cannot complete a later login', async() => {
  const harness = createNeteaseHarness()
  const response = deferred()
  harness.setResponse(async() => response.promise)
  harness.setCookieRows(authenticatedCookie)
  const oldLogin = harness.start()
  await tick()
  harness.windows[0].close()
  assert.equal((await oldLogin).configured, false)
  harness.setCookieRows([{ name: 'MUSIC_A', value: 'new-guest', domain: '.music.163.com' }])
  const newLogin = harness.start()
  response.resolve({ code: 200, account: { id: 12345 } })
  await tick()
  assert.equal(harness.windows[1].destroyed, false)
  assert.equal(harness.stored.has('cookie'), false)
  harness.windows[1].close()
  assert.equal((await newLogin).configured, false)
})

test('NetEase serializes verification and retries cookie changes received during a failed attempt', async() => {
  const harness = createNeteaseHarness()
  const response = deferred()
  harness.setResponse(async(_url, options) => {
    if (options.headers.Cookie.includes('old-token')) {
      await response.promise
      return { code: 200, account: { id: 0 } }
    }
    return { code: 200, account: { id: 12345 } }
  })
  harness.setCookieRows([{ name: 'MUSIC_U', value: 'old-token', domain: '.music.163.com' }])
  const login = harness.start()
  await tick()
  harness.setCookieRows(authenticatedCookie)
  harness.setCookieRows(authenticatedCookie)
  await tick()
  assert.equal(harness.requests.length, 1)
  response.resolve()
  assert.equal((await withDeadline(login)).configured, true)
  const saved = Buffer.from(harness.stored.get('cookie'), 'base64').toString()
  assert.match(saved, /MUSIC_U=synthetic-account-token/)
  assert.equal(harness.requests.length, 3)
})

test('A delayed NetEase page-load failure cannot close a later login window', async() => {
  const harness = createNeteaseHarness()
  const oldPage = deferred()
  harness.setPageLoad(async() => oldPage.promise)
  const oldLogin = harness.start()
  harness.windows[0].close()
  harness.setPageLoad(async() => {})
  const newLogin = harness.start()
  oldPage.reject(new Error('Cancelled navigation'))
  assert.equal((await withDeadline(oldLogin)).configured, false)
  assert.equal(harness.windows[1].destroyed, false)
  harness.windows[1].close()
  assert.equal((await newLogin).configured, false)
})

test('NetEase guest cookies saved by older versions are not configured accounts', async() => {
  const harness = createNeteaseHarness()
  harness.stored.set('cookie', Buffer.from('MUSIC_A=synthetic-guest').toString('base64'))
  assert.equal((await harness.status()).configured, false)
  await assert.rejects(harness.daily(), /请重新登录/)
  assert.equal(harness.requests.length, 0)
})

function createSearchHarness(kind) {
  const requests = new Map()
  const listInfo = { page: 1, limit: 20, total: 0, list: [], key: null, noItemLabel: '' }
  const state = { sources: ['tx', 'all'], maxPages: { tx: 0 }, listInfos: { tx: listInfo, all: { ...listInfo } } }
  const subject = loadSource(`src/renderer/store/search/${kind}/action.ts`, {
    '@common/utils/vueTools': { markRawList: value => value },
    '@renderer/utils/musicSdk': {
      __esModule: true,
      default: {
        tx: {
          [kind]: {
            search(text) { const request = deferred(); requests.set(text, request); return request.promise },
          },
        },
      },
    },
    '@common/utils/common': { similar: () => 1, sortInsert: (array, value) => array.push(value) },
    './state': state,
  }, { window: { i18n: { t: value => value } } })
  return { subject, requests, listInfo }
}

for (const kind of ['singer', 'album']) {
  for (const order of ['old-error-first', 'new-success-first']) {
    test(`${kind} search preserves the current results: ${order}`, async() => {
      const { subject, requests, listInfo } = createSearchHarness(kind)
      const oldSearch = subject.search('old-query', 1, 'tx')
      const newSearch = subject.search('new-query', 1, 'tx')
      const newerData = { list: [{ id: 'new-result', name: 'new-query', source: 'tx' }], limit: 20, total: 1, source: 'tx' }
      if (order === 'old-error-first') {
        requests.get('old-query').reject(new Error('Old request timed out'))
        assert.equal((await oldSearch).length, 0)
        assert.equal(listInfo.noItemLabel, 'list__loading')
        requests.get('new-query').resolve(newerData)
        await newSearch
      } else {
        requests.get('new-query').resolve(newerData)
        await newSearch
        requests.get('old-query').reject(new Error('Old request timed out'))
        assert.equal((await oldSearch).length, 0)
      }
      assert.equal(listInfo.list[0].id, 'new-result')
      assert.equal(listInfo.key, '1__tx__new-query')
      assert.equal(listInfo.noItemLabel, '')
      assert.equal(listInfo.total, 1)
    })
  }

  test(`${kind} search still reports a current failure`, async() => {
    const { subject, requests, listInfo } = createSearchHarness(kind)
    const search = subject.search('current-query', 1, 'tx')
    requests.get('current-query').reject(new Error('Current request timed out'))
    await assert.rejects(search, /Current request timed out/)
    assert.equal(listInfo.key, null)
    assert.equal(listInfo.list.length, 0)
    assert.equal(listInfo.noItemLabel, 'list__load_failed')
  })

  test(`${kind} search distinguishes two requests for the same query`, async() => {
    const { subject, requests, listInfo } = createSearchHarness(kind)
    listInfo.list = [{ id: 'earlier-result' }]
    listInfo.key = '1__tx__earlier-query'
    const oldSearch = subject.search('same-query', 1, 'tx')
    const oldRequest = requests.get('same-query')
    const newSearch = subject.search('same-query', 1, 'tx')
    requests.get('same-query').resolve({ list: [{ id: 'new-result' }], limit: 20, total: 1, source: 'tx' })
    await newSearch
    oldRequest.reject(new Error('Old request timed out'))
    assert.equal((await oldSearch).length, 0)
    assert.equal(listInfo.list[0].id, 'new-result')
    assert.equal(listInfo.noItemLabel, '')
    const latestRequest = requests.get('same-query')
    assert.equal((await subject.search('same-query', 1, 'tx'))[0].id, 'new-result')
    assert.equal(requests.get('same-query'), latestRequest)
  })

  test(`${kind} search ignores an outdated success after clearing the input`, async() => {
    const { subject, requests, listInfo } = createSearchHarness(kind)
    const search = subject.search('old-query', 1, 'tx')
    await subject.search('', 1, 'tx')
    requests.get('old-query').resolve({ list: [{ id: 'old-result' }], limit: 20, total: 1, source: 'tx' })
    assert.equal((await search).length, 0)
    assert.equal(listInfo.key, null)
    assert.equal(listInfo.noItemLabel, '')
  })

  test(`${kind} search view consumes handled search failures`, async() => {
    const directory = kind === 'singer' ? 'SingerList' : 'AlbumList'
    const hooks = loadSource(`src/renderer/views/Search/${directory}/useList.ts`, {
      '@common/utils/vueRouter': { onBeforeRouteLeave() {} },
      '@common/utils/vueTools': { ref: value => ({ value }), nextTick: async(callback) => callback() },
      '@renderer/store/search/action': { addHistoryWord: async() => {} },
      [`@renderer/store/search/${kind}`]: { search: async() => { throw new Error('Handled search failure') }, listInfos: { tx: {} } },
    }).default()
    hooks.search('query', 'tx', 1)
    await tick()
  })
}

function createLyricHarness(deferredClose = false) {
  const timers = new Map()
  let timerId = 0
  const timerApi = {
    setTimeout: callback => { timers.set(++timerId, callback); return timerId },
    clearTimeout: id => timers.delete(id),
    setInterval: () => ++timerId,
    clearInterval() {},
  }
  const common = loadSource('src/common/utils/common.ts', {}, timerApi)
  const windows = []
  class LyricWindow extends FakeWindow {
    constructor(options) { super(options); windows.push(this) }
    close() { if (!deferredClose) super.close() }
    finishClose() { super.close() }
  }
  const config = { 'desktopLyric.width': 860, 'desktopLyric.height': 120, 'desktopLyric.isAlwaysOnTop': true }
  const subject = loadSource('src/main/modules/winLyric/main.ts', {
    electron: { BrowserWindow: LyricWindow },
    '@common/utils': { debounce: common.debounce, getPlatform: () => 'win', isLinux: false, isWin: true },
    './utils': { minWidth: 38, minHeight: 38, initWindowSize: (_x, _y, width, height) => ({ x: 500, y: 8, width, height }) },
    '@common/mainIpc': { mainSend() {} },
    '@common/utils/electron': { encodePath: value => value },
  }, {
    ...timerApi,
    global: {
      envParams: { workAreaSize: { width: 1920, height: 1080 } },
      lx: {
        appSetting: config,
        theme: { shouldUseDarkColors: false, theme: {} },
        event_app: { update_config: values => Object.assign(config, values), desktop_lyric_window_created() {} },
      },
    },
  })
  return {
    subject,
    windows,
    config,
    flush() {
      const pending = Array.from(timers.values())
      timers.clear()
      for (const callback of pending) callback()
    },
  }
}

test('Lyric recreation resets menu state and ignores delayed bounds from the old window', () => {
  const { subject, config, flush } = createLyricHarness()
  subject.createWindow()
  subject.setBounds({ x: 450, y: 200, width: 860, height: 120 })
  subject.setLyricOverlay(true)
  assert.equal(subject.getBounds().height, 400)
  subject.closeWindow()
  assert.equal(subject.isLyricMenuOverlayOpen(), false)
  subject.createWindow()
  flush()
  assert.equal(config['desktopLyric.y'], 8)
  assert.equal(subject.isLyricMenuOverlayOpen(), false)
  subject.setLyricOverlay(true)
  assert.equal(subject.getBounds().height, 400)
  subject.setLyricOverlay(false)
  assert.equal(subject.getBounds().height, 120)
  assert.equal(subject.getBounds().y, 8)
  subject.closeWindow()
})

test('A delayed closed event cannot clear or modify a newly created lyric window', () => {
  const { subject, windows, flush } = createLyricHarness(true)
  subject.createWindow()
  subject.setLyricOverlay(true)
  subject.createWindow()
  windows[0].finishClose()
  windows[0].emit('move')
  windows[0].emit('resize')
  windows[0].emit('ready-to-show')
  flush()
  assert.equal(subject.isExistWindow(), true)
  assert.equal(subject.isLyricMenuOverlayOpen(), false)
  subject.setLyricOverlay(true)
  assert.equal(subject.getBounds().height, 400)
  windows[1].finishClose()
})

function makeSongs(start, count, albumForIndex) {
  return Array.from({ length: count }, (_, index) => ({
    songItem: {
      copyrightId: `song-${start + index}`,
      albumId: albumForIndex(start + index),
      album: `Album ${albumForIndex(start + index)}`,
      name: `Song ${start + index}`,
    },
  }))
}

function createMiguHarness(fetchPage, extra = {}) {
  const pages = []
  const subject = loadSource('src/renderer/utils/musicSdk/mg/singer.js', {
    './musicSearch': { createSignature: () => ({}) },
    './utils/index': {
      createHttpFetch: async(url) => {
        if (url.includes('resourceinfo')) return { resource: { name: 'Example Singer' } }
        const page = Number(new URL(url).searchParams.get('pageNo'))
        pages.push(page)
        return fetchPage(page)
      },
    },
    './musicInfo': { filterMusicInfoList: value => value, filterMusicInfoListV5: value => value },
  }, extra).default
  return { subject, pages }
}

test('Migu deduplicates albums across all song pages and paginates the album list', async() => {
  const { subject, pages } = createMiguHarness(async(page) => ({
    totalCount: 125,
    contents: makeSongs((page - 1) * 50, page === 3 ? 25 : 50, index => index < 55 ? 'A' : index < 105 ? 'B' : 'C'),
  }))
  const [first, second] = await Promise.all([subject.getAlbumList('example', 1, 1), subject.getAlbumList('example', 2, 1)])
  assert.equal(first.list[0].id, 'A')
  assert.equal(second.list[0].id, 'B')
  assert.equal(first.total, 3)
  assert.equal(first.limit, 1)
  assert.equal(first.page, 1)
  assert.equal((await subject.getAlbumList('example', 3, 1)).list[0].id, 'C')
  assert.equal((await subject.getAlbumList('example', 4, 1)).list.length, 0)
  assert.equal((await subject.getAlbumList('example')).list.length, 3)
  assert.deepEqual(pages, [1, 2, 3])
})

test('Migu follows shorter provider pages when the total says more songs remain', async() => {
  const { subject, pages } = createMiguHarness(async(page) => ({
    totalCount: 50, contents: makeSongs((page - 1) * 25, 25, index => index < 25 ? 'A' : 'B'),
  }))
  const result = await subject.getAlbumList('example')
  assert.equal(result.total, 2)
  assert.deepEqual(pages, [1, 2])
})

test('Migu traverses pages without a declared total until an empty last page', async() => {
  const { subject, pages } = createMiguHarness(async(page) => ({
    contents: page < 3 ? makeSongs((page - 1) * 50, 50, index => index < 50 ? 'A' : 'B') : [],
  }))
  assert.equal((await subject.getAlbumList('example')).total, 2)
  assert.deepEqual(pages, [1, 2, 3])
})

test('Migu album fetch failures reject and evict the failed cache for a retry', async() => {
  let fail = true
  const { subject, pages } = createMiguHarness(async(page) => {
    if (page === 2 && fail) throw new Error('Provider timeout')
    return { totalCount: 100, contents: makeSongs((page - 1) * 50, 50, index => index < 50 ? 'A' : 'B') }
  })
  await assert.rejects(subject.getAlbumList('example'), /Provider timeout/)
  fail = false
  assert.equal((await subject.getAlbumList('example')).total, 2)
  assert.deepEqual(pages, [1, 2, 1, 2])
})

test('Migu stops a provider that repeats the same song page', async() => {
  const { subject, pages } = createMiguHarness(async() => ({ contents: makeSongs(0, 50, () => 'A') }))
  await assert.rejects(subject.getAlbumList('example'), /重复分页/)
  assert.deepEqual(pages, [1, 2])
})

test('Migu refreshes expired album data', async() => {
  let now = 1000
  class FakeDate extends Date { static now() { return now } }
  const { subject, pages } = createMiguHarness(async() => ({ contents: makeSongs(now, 1, () => String(now)) }), { Date: FakeDate })
  assert.equal((await subject.getAlbumList('example')).list[0].id, '1000')
  now += 5 * 60 * 1000 + 1
  assert.equal((await subject.getAlbumList('example')).list[0].id, String(now))
  assert.deepEqual(pages, [1, 1])
})

test('Migu returns a legitimate empty album list with the requested page size', async() => {
  const { subject } = createMiguHarness(async() => ({ contents: [] }))
  const result = await subject.getAlbumList('example', 1, 20)
  assert.equal(result.total, 0)
  assert.equal(result.limit, 20)
  assert.equal(result.list.length, 0)
})

async function createSyncHarness() {
  const entry = http.createServer()
  const target = http.createServer()
  const socketServer = new WebSocket.WebSocketServer({ noServer: true })
  const reached = []
  let redirects = 0
  await Promise.all([
    new Promise(resolve => entry.listen(0, '127.0.0.1', resolve)),
    new Promise(resolve => target.listen(0, '127.0.0.1', resolve)),
  ])
  const entryPort = entry.address().port
  const targetPort = target.address().port
  entry.on('upgrade', (request, socket) => {
    redirects++
    const url = new URL(request.url, `http://127.0.0.1:${entryPort}`)
    const location = url.pathname.startsWith('/loop/')
      ? `ws://127.0.0.1:${entryPort}${request.url}`
      : url.pathname.startsWith('/entry/')
        ? `/hop/socket${url.search}`
        : `ws://127.0.0.1:${targetPort}/target/socket${url.search}`
    socket.end(`HTTP/1.1 307 Temporary Redirect\r\nLocation: ${location}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  })
  target.on('upgrade', (request, socket, head) => {
    reached.push(new URL(request.url, `http://127.0.0.1:${targetPort}`))
    socketServer.handleUpgrade(request, socket, head, client => socketServer.emit('connection', client))
  })
  let statusCallback = () => {}
  const subject = loadSource('src/main/modules/sync/client/client.ts', {
    ws: WebSocket,
    './utils': { encryptMsg: async(_key, message) => message, decryptMsg: async(_key, message) => message },
    './sync': { callObj: {} },
    '../log': { __esModule: true, default: quiet },
    '@common/utils/common': { dateFormat: value => String(value) },
    '../utils': { aesEncrypt: () => 'synthetic-ticket' },
    '@main/modules/winMain': { sendClientStatus: status => statusCallback({ ...status }) },
    message2call: { createMsg2call: () => ({ remote: {}, createQueueRemote: () => ({}), destroy() {} }) },
    '@common/constants_sync': { SYNC_CLOSE_CODE: { normal: 1000, failed: 4100 }, SYNC_CODE: { msgConnect: 'synthetic-connect' } },
    '@common/utils/nodejs': { getAddress: () => [] },
  }, { setTimeout: () => 1, clearTimeout() {} }, 'exports.getTestSocket = () => client;')
  return {
    reached,
    redirects: () => redirects,
    async connect(path, expectedMessage = 'Wait syncing...') {
      const status = deferred()
      statusCallback = update => {
        if (update.message === expectedMessage) status.resolve(update)
        else if (update.message && update.message !== 'Wait syncing...') status.reject(new Error(update.message))
      }
      const hostPath = `127.0.0.1:${path === 'direct' ? targetPort : entryPort}/${path === 'direct' ? 'target' : path}`
      subject.connect({ wsProtocol: 'ws:', hostPath }, { clientId: 'synthetic-client', key: 'synthetic-key' })
      return withDeadline(status.promise)
    },
    async disconnect() {
      const socket = subject.getTestSocket()
      if (!socket) return
      const closed = socket.readyState === WebSocket.CLOSED ? Promise.resolve() : once(socket, 'close')
      await subject.disconnect()
      await withDeadline(closed)
    },
    async dispose() {
      await subject.disconnect()
      for (const client of socketServer.clients) client.terminate()
      await Promise.all([
        new Promise(resolve => entry.close(resolve)),
        new Promise(resolve => target.close(resolve)),
        new Promise(resolve => socketServer.close(resolve)),
      ])
    },
  }
}

test('Sync follows relative and cross-port 307 redirects and retains its ticket', async() => {
  const harness = await createSyncHarness()
  try {
    await harness.connect('entry')
    assert.equal(harness.redirects(), 2)
    assert.equal(harness.reached.length, 1)
    assert.equal(harness.reached[0].searchParams.get('i'), 'synthetic-client')
    assert.equal(harness.reached[0].searchParams.get('t'), 'synthetic-ticket')
    await harness.disconnect()
    await harness.connect('direct')
    assert.equal(harness.reached.length, 2)
    await harness.disconnect()
  } finally {
    await harness.dispose()
  }
})

test('Sync fails a redirect loop after five redirects', async() => {
  const harness = await createSyncHarness()
  try {
    await harness.connect('loop', 'Maximum redirects exceeded')
    assert.equal(harness.redirects(), 6)
    assert.equal(harness.reached.length, 0)
    await harness.disconnect()
  } finally {
    await harness.dispose()
  }
})
