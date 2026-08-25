import { BrowserWindow, safeStorage, session } from 'electron'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { mainHandle } from '@common/mainIpc'
import { request } from '@common/utils/request'
import { STORE_NAMES } from '@common/constants'
import getStore from '@main/utils/store'
import { weapi } from '../../../../renderer/utils/musicSdk/wy/utils/crypto'

const NETEASE_LOGIN_PARTITION = 'netease-music-login'
const NETEASE_LOGIN_URL = 'https://music.163.com/'
const NETEASE_API_URL = 'https://music.163.com'
const COOKIE_KEY = 'cookie'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

let loginWindow: BrowserWindow | null = null
let loginPromise: Promise<LX.NeteaseMusic.LoginResult> | null = null
let resolveLogin: ((result: LX.NeteaseMusic.LoginResult) => void) | null = null
let loginCookieChanged: (() => void) | null = null

const getNeteaseStore = () => getStore(STORE_NAMES.NETEASE_MUSIC)
const parseCookies = (cookie: string) => {
  const result = new Map<string, string>()
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=')
    if (index > 0) result.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return result
}

const getCookie = () => {
  const encrypted = getNeteaseStore().get<string>(COOKIE_KEY)
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    return ''
  }
}

const saveCookie = (cookie: string) => {
  const value = cookie.trim()
  if (!value) {
    getNeteaseStore().set(COOKIE_KEY, '')
    return
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用，无法安全保存网易云音乐 Cookie')
  getNeteaseStore().set(COOKIE_KEY, safeStorage.encryptString(value).toString('base64'))
}

const getNeteaseLoginSession = () => session.fromPartition(NETEASE_LOGIN_PARTITION)
const isNeteaseCookieDomain = (domain?: string) => {
  const normalized = (domain ?? '').replace(/^\./, '').toLowerCase()
  return normalized == '163.com' || normalized.endsWith('.163.com')
}
const getNeteaseCookieHeader = async() => {
  const cookieMap = new Map<string, Electron.Cookie>()
  const cookies = await getNeteaseLoginSession().cookies.get({})
  for (const cookie of cookies) {
    if (!isNeteaseCookieDomain(cookie.domain) || !cookie.value) continue
    const previous = cookieMap.get(cookie.name)
    const isMusicDomain = (cookie.domain ?? '').replace(/^\./, '').toLowerCase() == 'music.163.com'
    const previousIsMusicDomain = (previous?.domain ?? '').replace(/^\./, '').toLowerCase() == 'music.163.com'
    if (!previous || (isMusicDomain && !previousIsMusicDomain)) cookieMap.set(cookie.name, cookie)
  }
  return Array.from(cookieMap.values()).map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
}
const hasNeteaseLoginCookie = (cookie: string) => {
  const cookies = parseCookies(cookie)
  return !!(cookies.get('MUSIC_U') || cookies.get('MUSIC_A'))
}
const isNeteaseLoginUrl = (url: string) => {
  try {
    const target = new URL(url)
    return target.protocol == 'https:' && isNeteaseCookieDomain(target.hostname)
  } catch {
    return false
  }
}
const clearNeteaseLoginSession = async() => getNeteaseLoginSession().clearStorageData({ storages: ['cookies'] })

const finishNeteaseLogin = (configured: boolean) => {
  if (!loginPromise) return
  const currentWindow = loginWindow
  const resolve = resolveLogin
  const authSession = getNeteaseLoginSession()
  if (loginCookieChanged) authSession.cookies.removeListener('changed', loginCookieChanged)
  loginWindow = null
  loginPromise = null
  resolveLogin = null
  loginCookieChanged = null
  if (currentWindow && !currentWindow.isDestroyed()) currentWindow.close()
  void clearNeteaseLoginSession()
  resolve?.({ configured: configured || !!getCookie() })
}

const openNeteaseLogin = async(parent: BrowserWindow | null) => {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show()
    loginWindow.focus()
    return loginPromise ?? { configured: false }
  }
  const authSession = getNeteaseLoginSession()
  const syncCookie = async() => {
    const cookie = await getNeteaseCookieHeader()
    if (!hasNeteaseLoginCookie(cookie)) return false
    saveCookie(cookie)
    finishNeteaseLogin(true)
    return true
  }
  const result = new Promise<LX.NeteaseMusic.LoginResult>(resolve => {
    resolveLogin = resolve
  })
  loginPromise = result
  const browserWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 820,
    minHeight: 600,
    title: '网易云音乐登录',
    autoHideMenuBar: true,
    parent: parent ?? undefined,
    webPreferences: {
      session: authSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      enableWebSQL: false,
      spellcheck: false,
    },
  })
  loginWindow = browserWindow
  loginCookieChanged = () => { void syncCookie() }
  authSession.cookies.on('changed', loginCookieChanged)
  browserWindow.webContents.setWindowOpenHandler(({ url }) => ({ action: isNeteaseLoginUrl(url) ? 'allow' : 'deny' }))
  browserWindow.webContents.on('will-navigate', (event, url) => {
    if (!isNeteaseLoginUrl(url)) event.preventDefault()
  })
  browserWindow.webContents.on('will-redirect', (event, url) => {
    if (!isNeteaseLoginUrl(url)) event.preventDefault()
  })
  browserWindow.webContents.on('did-navigate', () => { void syncCookie() })
  browserWindow.webContents.on('did-navigate-in-page', () => { void syncCookie() })
  browserWindow.on('closed', () => {
    if (loginWindow === browserWindow) finishNeteaseLogin(false)
  })
  try {
    await browserWindow.loadURL(NETEASE_LOGIN_URL)
  } catch {
    finishNeteaseLogin(false)
  }
  return result
}

const getRequiredCookie = () => {
  const cookie = getCookie()
  if (!cookie) throw new Error('网易云音乐 Cookie 未配置')
  return cookie
}

const parseNeteaseResponseBody = (body: unknown): Record<string, any> => {
  if (body && typeof body == 'object' && !Buffer.isBuffer(body)) return body as Record<string, any>
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '')
  try {
    const parsed = JSON.parse(text) as unknown
    if (parsed && typeof parsed == 'object') return parsed as Record<string, any>
  } catch {}
  throw new Error('网易云音乐响应格式异常')
}

const requestNetease = async(path: string, params: Record<string, any> = {}) => {
  const cookie = getRequiredCookie()
  const cookies = parseCookies(cookie)
  const response = await request<Record<string, any>>(`${NETEASE_API_URL}${path}`, {
    method: 'POST',
    form: weapi({
      ...params,
      csrf_token: cookies.get('__csrf') ?? '',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Referer: 'https://music.163.com/',
      Origin: 'https://music.163.com',
      Cookie: cookie,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    timeout: 30000,
  })
  if (response.statusCode != 200) throw new Error(`网易云音乐 HTTP ${response.statusCode}`)
  const body = parseNeteaseResponseBody(response.body)
  if (Number(body.code ?? -1) != 200) {
    throw new Error(`网易云音乐接口返回 code ${body.code ?? -1}`)
  }
  return body
}

const formatTime = (milliseconds: unknown) => {
  const seconds = Math.max(0, Math.floor(Number(milliseconds ?? 0) / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
const singerName = (song: Record<string, any>) => {
  const singers = song.ar ?? song.artists ?? song.singer ?? []
  if (Array.isArray(singers)) return singers.map(item => String(item?.name ?? item ?? '')).filter(Boolean).join('、')
  return String(singers ?? '')
}
const buildQualitys = (song: Record<string, any>, privilege: Record<string, any>) => {
  const maxbr = Number(privilege.maxbr ?? song.privilege?.maxbr ?? 128000)
  const types: Array<{ type: LX.Quality, size: string | null }> = [{ type: '128k', size: null }]
  const qualitys: Record<string, { size: string | null }> = { '128k': { size: null } }
  if (maxbr >= 320000) {
    types.unshift({ type: '320k', size: null })
    qualitys['320k'] = { size: null }
  }
  if (maxbr >= 999000) {
    types.unshift({ type: 'flac', size: null })
    qualitys.flac = { size: null }
  }
  return { types, qualitys }
}
const toOldSong = (raw: Record<string, any>, privilege: Record<string, any> = {}) => {
  const song = raw.song ?? raw
  const { types, qualitys } = buildQualitys(song, privilege)
  const album = song.al ?? song.album ?? {}
  const id = song.id ?? song.songId
  if (!id || !song.name) return null
  return {
    singer: singerName(song),
    name: String(song.name),
    albumName: String(album.name ?? ''),
    albumId: album.id ?? '',
    source: 'wy',
    interval: formatTime(song.dt ?? song.duration),
    songmid: String(id),
    img: String(album.picUrl ?? song.picUrl ?? ''),
    types,
    _types: qualitys,
    typeUrl: {},
  }
}
const mapSongs = (items: unknown[]) => items.map(item => {
  const raw = item as Record<string, any>
  return toOldSong(raw.song ?? raw, raw.privilege ?? raw.song?.privilege ?? {})
}).filter(Boolean) as Array<Record<string, any>>

const getDailyRecommend = async() => {
  const body = await requestNetease('/weapi/v1/discovery/recommend/songs', { limit: 30, offset: 0, total: true })
  const data = body.data ?? body
  const list = mapSongs(data.dailySongs ?? data.recommend ?? body.dailySongs ?? [])
  return {
    info: { name: '网易云每日推荐', desc: '每天更新的个性化歌曲', img: String(list[0]?.img ?? '') },
    list,
    total: list.length,
  } satisfies LX.NeteaseMusic.SongRecommend
}

const getPersonalFM = async() => {
  const body = await requestNetease('/weapi/v1/radio/get')
  const list = mapSongs(body.data ?? body)
  return {
    info: { name: '私人 FM', desc: '基于网易云音乐账号画像的私人推荐', img: String(list[0]?.img ?? '') },
    list,
    total: list.length,
  } satisfies LX.NeteaseMusic.SongRecommend
}

const getRecommendPlaylists = async() => {
  const body = await requestNetease('/weapi/personalized/playlist', { limit: 30, offset: 0, total: true })
  const list = (body.result ?? body.data ?? []).map((item: Record<string, any>) => ({
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    author: String(item.creator?.nickname ?? ''),
    img: String(item.picUrl ?? item.coverImgUrl ?? ''),
    desc: String(item.copywriter ?? item.description ?? ''),
    playCount: Number(item.playcount ?? item.playCount ?? 0),
  })).filter((item: Record<string, string | number>) => item.id && item.name)
  return { list } satisfies LX.NeteaseMusic.PlaylistRecommend
}

const getNewSongs = async() => {
  const body = await requestNetease('/weapi/personalized/newsong', { limit: 30, offset: 0, total: true })
  const list = mapSongs(body.result ?? body.data ?? [])
  return {
    info: { name: '网易云新歌推荐', desc: '最近发布的网易云音乐新歌', img: String(list[0]?.img ?? '') },
    list,
    total: list.length,
  } satisfies LX.NeteaseMusic.SongRecommend
}

export default () => {
  mainHandle<string, boolean>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_set_cookie, async({ params: cookie }) => {
    saveCookie(cookie)
    if (!cookie.trim()) void clearNeteaseLoginSession()
    return true
  })
  mainHandle<LX.NeteaseMusic.Status>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_status, async() => ({ configured: !!getCookie() }))
  mainHandle<undefined, LX.NeteaseMusic.LoginResult>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_login, async({ event }) => openNeteaseLogin(BrowserWindow.fromWebContents(event.sender)))
  mainHandle<LX.NeteaseMusic.SongRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_daily_recommend, getDailyRecommend)
  mainHandle<LX.NeteaseMusic.SongRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_personal_fm, getPersonalFM)
  mainHandle<LX.NeteaseMusic.PlaylistRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_recommend_playlists, getRecommendPlaylists)
  mainHandle<LX.NeteaseMusic.SongRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_new_songs, getNewSongs)
}
