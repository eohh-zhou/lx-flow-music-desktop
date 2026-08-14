import { BrowserWindow, safeStorage, session } from 'electron'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { mainHandle } from '@common/mainIpc'
import { request } from '@common/utils/request'
import { STORE_NAMES } from '@common/constants'
import getStore from '@main/utils/store'

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const COOKIE_KEY = 'cookie'
const QQ_MUSIC_LOGIN_PARTITION = 'qq-music-login'
const QQ_MUSIC_LOGIN_URL = 'https://y.qq.com/n/ryqq/profile'
const recentReports = new Map<string, number>()
let loginWindow: BrowserWindow | null = null
let loginPromise: Promise<LX.QQMusic.LoginResult> | null = null
let resolveLogin: ((result: LX.QQMusic.LoginResult) => void) | null = null
let loginCookieChanged: (() => void) | null = null
let loginDownloadListener: ((event: Electron.Event) => void) | null = null

const getQQMusicStore = () => getStore(STORE_NAMES.QQ_MUSIC)

const parseCookies = (cookie: string) => {
  const result = new Map<string, string>()
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=')
    if (index > 0) result.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return result
}

const normalizeUin = (value: string | undefined) => {
  if (!value) return '0'
  const normalized = value.replace(/^o/, '').replace(/^0+(?=\d)/, '')
  return /^\d+$/.test(normalized) ? normalized : '0'
}

const getGtk = (skey: string) => {
  let hash = 5381
  for (const char of skey) hash += (hash << 5) + char.charCodeAt(0)
  return hash & 0x7fffffff
}

const getCookie = () => {
  const encrypted = getQQMusicStore().get<string>(COOKIE_KEY)
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
    getQQMusicStore().set(COOKIE_KEY, '')
    return
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储不可用，无法安全保存 QQ Music Cookie')
  getQQMusicStore().set(COOKIE_KEY, safeStorage.encryptString(value).toString('base64'))
}

const getQQMusicLoginSession = () => session.fromPartition(QQ_MUSIC_LOGIN_PARTITION)

const isQQMusicCookieDomain = (domain?: string) => {
  const normalized = (domain ?? '').replace(/^\./, '').toLowerCase()
  return normalized == 'qq.com' || normalized.endsWith('.qq.com')
}

const getQQMusicCookieHeader = async() => {
  const cookieMap = new Map<string, Electron.Cookie>()
  const cookies = await getQQMusicLoginSession().cookies.get({})
  for (const cookie of cookies) {
    if (!isQQMusicCookieDomain(cookie.domain) || !cookie.value) continue
    const previous = cookieMap.get(cookie.name)
    const isYQQCookie = (cookie.domain ?? '').replace(/^\./, '').toLowerCase() == 'y.qq.com'
    const previousIsYQQCookie = (previous?.domain ?? '').replace(/^\./, '').toLowerCase() == 'y.qq.com'
    if (!previous || (isYQQCookie && !previousIsYQQCookie)) cookieMap.set(cookie.name, cookie)
  }
  return Array.from(cookieMap.values()).map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
}

const hasQQMusicLoginCookie = (cookie: string) => {
  const cookies = parseCookies(cookie)
  const uin = normalizeUin(cookies.get('uin') ?? cookies.get('p_uin') ?? cookies.get('wxuin'))
  const authst = cookies.get('qqmusic_key') ?? cookies.get('qm_keyst')
  return uin != '0' && !!authst
}

const isQQMusicLoginUrl = (url: string) => {
  try {
    const target = new URL(url)
    return target.protocol == 'https:' && isQQMusicCookieDomain(target.hostname)
  } catch {
    return false
  }
}

const clearQQMusicLoginSession = () => getQQMusicLoginSession().clearStorageData({ storages: ['cookies'] })

const finishQQMusicLogin = (configured: boolean) => {
  if (!loginPromise) return
  const currentWindow = loginWindow
  const resolve = resolveLogin
  const authSession = getQQMusicLoginSession()
  if (loginCookieChanged) authSession.cookies.removeListener('changed', loginCookieChanged)
  if (loginDownloadListener) authSession.removeListener('will-download', loginDownloadListener)
  loginWindow = null
  loginPromise = null
  resolveLogin = null
  loginCookieChanged = null
  loginDownloadListener = null
  if (currentWindow && !currentWindow.isDestroyed()) currentWindow.close()
  void clearQQMusicLoginSession()
  resolve?.({ configured: configured || !!getCookie() })
}

const openQQMusicLogin = async(parent: BrowserWindow | null) => {
  if (loginWindow && !loginWindow.isDestroyed()) {
    loginWindow.show()
    loginWindow.focus()
    return loginPromise ?? { configured: false }
  }

  const authSession = getQQMusicLoginSession()
  const syncCookie = async() => {
    const cookie = await getQQMusicCookieHeader()
    if (!hasQQMusicLoginCookie(cookie)) return false
    saveCookie(cookie)
    finishQQMusicLogin(true)
    return true
  }

  const result = new Promise<LX.QQMusic.LoginResult>(resolve => {
    resolveLogin = resolve
  })
  loginPromise = result
  const browserWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 820,
    minHeight: 600,
    title: 'QQ音乐登录',
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
  loginCookieChanged = () => {
    void syncCookie()
  }
  loginDownloadListener = event => {
    event.preventDefault()
  }
  authSession.cookies.on('changed', loginCookieChanged)
  authSession.on('will-download', loginDownloadListener)

  browserWindow.webContents.setWindowOpenHandler(({ url }) => ({ action: isQQMusicLoginUrl(url) ? 'allow' : 'deny' }))
  browserWindow.webContents.on('will-navigate', (event, url) => {
    if (!isQQMusicLoginUrl(url)) event.preventDefault()
  })
  browserWindow.webContents.on('will-redirect', (event, url) => {
    if (!isQQMusicLoginUrl(url)) event.preventDefault()
  })
  browserWindow.webContents.on('did-navigate', () => {
    void syncCookie()
  })
  browserWindow.webContents.on('did-navigate-in-page', () => {
    void syncCookie()
  })
  browserWindow.on('closed', () => {
    if (loginWindow === browserWindow) finishQQMusicLogin(false)
  })

  try {
    await browserWindow.loadURL(QQ_MUSIC_LOGIN_URL)
  } catch {
    finishQQMusicLogin(false)
  }
  return result
}

const getRequiredCookie = () => {
  const cookie = getCookie()
  if (!cookie) throw new Error('QQ Music Cookie is not configured')
  return cookie
}

const buildComm = (cookie: string) => {
  const cookies = parseCookies(cookie)
  const skey = cookies.get('p_skey') ?? cookies.get('skey') ?? ''
  const authst = cookies.get('qqmusic_key') ?? cookies.get('qm_keyst') ?? ''
  const loginType = cookies.get('tmeLoginType')
  const comm: Record<string, any> = {
    ct: 24,
    cv: 0,
    format: 'json',
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 1,
    uin: normalizeUin(cookies.get('uin') ?? cookies.get('p_uin') ?? cookies.get('wxuin')),
  }
  if (skey) comm.g_tk_new_20200303 = getGtk(skey)
  if (authst) comm.authst = authst
  if (loginType && /^\d+$/.test(loginType)) comm.tmeLoginType = Number(loginType)
  return comm
}

const requestMusicu = async(requestBody: Record<string, any>, cookie: string) => {
  const response = await request<Record<string, any>>(MUSICU_URL, {
    method: 'POST',
    json: { comm: buildComm(cookie), req_0: requestBody },
    headers: {
      'Content-Type': 'application/json',
      Referer: 'https://y.qq.com/',
      Origin: 'https://y.qq.com',
      Cookie: cookie,
    },
    timeout: 30000,
  })
  if (response.statusCode !== 200) throw new Error(`QQ Music HTTP ${response.statusCode}`)
  const body = response.body
  if (body.code !== 0) throw new Error(`QQ Music outer code ${body.code}`)
  const item = body.req_0
  if (!item || item.code !== 0) throw new Error(`QQ Music module code ${item?.code ?? -1}`)
  return item.data ?? {}
}

const formatTime = (seconds: unknown) => {
  const value = Number(seconds ?? 0)
  if (!Number.isFinite(value) || value <= 0) return null
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}

const formatSize = (size: unknown) => {
  const value = Number(size ?? 0)
  if (!value) return null
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}M`
  return `${(value / 1024).toFixed(2)}K`
}

const buildQualities = (file: Record<string, any> = {}) => {
  const fields: Array<[LX.Quality, string]> = [
    ['128k', 'size_128mp3'],
    ['320k', 'size_320mp3'],
    ['flac', 'size_flac'],
    ['flac24bit', 'size_hires'],
  ]
  const types: Array<{ type: LX.Quality, size: string | null }> = []
  const qualitys: Record<string, { size: string | null }> = {}
  for (const [type, field] of fields) {
    if (!Number(file[field])) continue
    const size = formatSize(file[field])
    types.push({ type, size })
    qualitys[type] = { size }
  }
  if (!types.length) {
    types.push({ type: '128k', size: null })
    qualitys['128k'] = { size: null }
  }
  return { types, qualitys }
}

const toOldSongInfo = (song: Record<string, any>) => {
  const album = song.album ?? {}
  const singer = Array.isArray(song.singer)
    ? song.singer.map(item => item?.name).filter(Boolean).join('、')
    : String(song.singername ?? '')
  const { types, qualitys } = buildQualities(song.file)
  const albumId = String(album.mid ?? album.id ?? song.albummid ?? '')
  const songmid = String(song.mid ?? song.songmid ?? '')
  return {
    singer,
    name: String(song.title ?? song.songname ?? song.name ?? ''),
    albumName: String(album.name ?? song.albumname ?? ''),
    albumId,
    source: 'tx',
    interval: formatTime(song.interval ?? song.duration),
    songId: song.id ?? song.songid ?? '',
    albumMid: albumId,
    strMediaMid: String(song.file?.media_mid ?? song.strMediaMid ?? songmid),
    songmid,
    img: albumId
      ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`
      : '',
    types,
    _types: qualitys,
    typeUrl: {},
  }
}

const getDailyRecommend = async() => {
  const cookie = getRequiredCookie()
  const cookies = parseCookies(cookie)
  const uin = normalizeUin(cookies.get('uin') ?? cookies.get('p_uin') ?? cookies.get('wxuin'))
  const data = await requestMusicu({
    module: 'music.srfDissInfo.DissInfo',
    method: 'CgiGetDiss',
    param: {
      new_format: 1,
      disstid: 0,
      enc_host_uin: uin,
      dirid: 202,
      onlysonglist: 0,
      need_game_ad: 1,
      optype: 2,
      orderlist: 0,
      tag: 1,
      userinfo: 1,
      is_mobile: 1,
      censor_status: 1,
      local_time: Math.floor(Date.now() / 1000),
      update_rtime: 1,
      ctx: 0,
      CountdownTime: 0,
    },
  }, cookie)
  const songs = Array.isArray(data.songlist)
    ? data.songlist.map(toOldSongInfo).filter((item: ReturnType<typeof toOldSongInfo>) => item.songmid)
    : []
  const dirinfo = data.dirinfo ?? {}
  return {
    info: {
      name: String(dirinfo.dissname ?? dirinfo.title ?? '今日私享'),
      desc: 'QQ音乐每日推荐',
      img: String(dirinfo.picurl ?? dirinfo.logo ?? songs[0]?.img ?? ''),
    },
    list: songs,
    total: Number(data.total_song_num ?? songs.length),
  } satisfies LX.QQMusic.DailyRecommend
}

const normalizeImageUrl = (url: unknown) => String(url ?? '').replace(/^http:\/\//, 'https://')

const getRadarList = async() => {
  const cookie = getRequiredCookie()
  const data = await requestMusicu({
    module: 'pf.radiosvr',
    method: 'GetRadiolist',
    param: { ct: '24' },
  }, cookie)
  const groups = Array.isArray(data.radio_list)
    ? data.radio_list.map((group: Record<string, any>) => ({
      id: Number(group.id ?? 0),
      name: String(group.title ?? ''),
      list: Array.isArray(group.list)
        ? group.list.map((item: Record<string, any>) => ({
          id: Number(item.id ?? 0),
          name: String(item.title ?? ''),
          img: normalizeImageUrl(item.pic_url),
          listenCount: Number(item.listenNum ?? 0),
        })).filter((item: LX.QQMusic.RadioItem) => item.id && item.name)
        : [],
    })).filter((group: LX.QQMusic.RadioGroup) => group.list.length)
    : []
  return { groups } satisfies LX.QQMusic.RadarRecommend
}

const getRadarTracks = async(radioId: number) => {
  const cookie = getRequiredCookie()
  if (!Number.isInteger(radioId) || radioId <= 0) throw new Error('Invalid QQ Music radio ID')
  const data = await requestMusicu({
    module: 'mb_track_radio_svr',
    method: 'get_radio_track',
    param: {
      id: radioId,
      firstplay: 1,
      num: 30,
    },
  }, cookie)
  const songs = Array.isArray(data.tracks)
    ? data.tracks.map(toOldSongInfo).filter((item: ReturnType<typeof toOldSongInfo>) => item.songmid)
    : []
  return {
    info: {
      name: String(data.name ?? '雷达推荐'),
      desc: '基于 QQ 音乐账号画像动态生成',
      img: normalizeImageUrl(data.bg_pic_url ?? songs[0]?.img),
    },
    list: songs,
    total: songs.length,
  } satisfies LX.QQMusic.DailyRecommend
}

const getRecommendPlaylists = async() => {
  const cookie = getRequiredCookie()
  const data = await requestMusicu({
    module: 'playlist.HotRecommendServer',
    method: 'get_hot_recommend',
    param: { async: 1, cmd: 2 },
  }, cookie)
  const list = Array.isArray(data.v_hot)
    ? data.v_hot.map((item: Record<string, any>) => ({
      id: String(item.content_id ?? ''),
      name: String(item.title ?? ''),
      author: String(item.username ?? ''),
      img: normalizeImageUrl(item.cover),
      desc: String(item.rcmdcontent ?? item.rcmdtemplate ?? ''),
      playCount: Number(item.listen_num ?? 0),
    })).filter((item: LX.QQMusic.PlaylistItem) => item.id && item.name)
    : []
  return { list } satisfies LX.QQMusic.PlaylistRecommend
}

const getNewSongs = async(type: number) => {
  const cookie = getRequiredCookie()
  const validTypes = new Set([1, 2, 3, 4, 5, 6])
  if (!validTypes.has(type)) throw new Error('Invalid QQ Music new song type')
  const data = await requestMusicu({
    module: 'newsong.NewSongServer',
    method: 'get_new_song_info',
    param: { type },
  }, cookie)
  const songs = Array.isArray(data.songlist)
    ? data.songlist.map(toOldSongInfo).filter((item: ReturnType<typeof toOldSongInfo>) => item.songmid)
    : []
  return {
    type,
    name: String(data.lan ?? '新歌'),
    list: songs,
    total: songs.length,
  } satisfies LX.QQMusic.NewSongRecommend
}

const searchSong = async(cookie: string, query: string) => {
  const response = await request<Record<string, any>>('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
    method: 'GET',
    query: { format: 'json', p: 1, n: 5, w: query },
    headers: { Referer: 'https://y.qq.com/' },
    timeout: 30000,
  })
  if (response.statusCode !== 200 || response.body?.code !== 0) return null
  const list = response.body?.data?.song?.list
  if (!Array.isArray(list) || !list.length) return null
  return list[0]
}

const resolveReportSong = async(cookie: string, report: LX.QQMusic.PlayReport) => {
  if (report.songmid) {
    const data = await requestMusicu({
      module: 'music.pf_song_detail_svr',
      method: 'get_song_detail_yqq',
      param: { song_type: 0, song_mid: report.songmid },
    }, cookie)
    const track = data.track_info
    if (track?.id && track?.mid) {
      return {
        id: String(track.id),
        albumId: String(track.album?.id ?? report.albumId ?? ''),
      }
    }
  }
  const item = await searchSong(cookie, `${report.name} ${report.singer}`.trim())
  if (!item?.id || !item?.mid) return null
  return {
    id: String(item.id),
    albumId: String(item.album?.id ?? item.album?.mid ?? report.albumId ?? ''),
  }
}

const reportPlay = async(report: LX.QQMusic.PlayReport) => {
  const cookie = getCookie()
  if (!cookie) return { reported: false, reason: 'not-configured' }
  const key = report.songmid ?? `${report.name}\u0000${report.singer}`
  const now = Date.now()
  if (now - (recentReports.get(key) ?? 0) < 30000) return { reported: false, reason: 'deduplicated' }
  const song = await resolveReportSong(cookie, report)
  if (!song) return { reported: false, reason: 'song-not-resolved' }
  await requestMusicu({
    module: 'music.musicasset.PlayRecentlyWrite',
    method: 'ReportPlayRecentlyInfo',
    param: {
      data: [{
        id: song.id,
        type: 2,
        lastTime: Math.floor(now / 1000),
        listenCnt: 1,
        auxillaryID: song.albumId,
      }],
    },
  }, cookie)
  recentReports.set(key, now)
  return { reported: true }
}

export default () => {
  mainHandle<string, boolean>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_set_cookie, async({ params: cookie }) => {
    saveCookie(cookie)
    if (!cookie.trim()) void clearQQMusicLoginSession()
    return true
  })
  mainHandle<LX.QQMusic.Status>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_status, async() => ({
    configured: !!getCookie(),
  }))
  mainHandle<void, LX.QQMusic.LoginResult>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_login, async({ event }) => {
    return openQQMusicLogin(BrowserWindow.fromWebContents(event.sender))
  })
  mainHandle<LX.QQMusic.DailyRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_daily_recommend, getDailyRecommend)
  mainHandle<LX.QQMusic.RadarRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_radar_list, getRadarList)
  mainHandle<number, LX.QQMusic.DailyRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_radar_tracks, async({ params }) => getRadarTracks(params))
  mainHandle<LX.QQMusic.PlaylistRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_recommend_playlists, getRecommendPlaylists)
  mainHandle<number, LX.QQMusic.NewSongRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_new_songs, async({ params }) => getNewSongs(params))
  mainHandle<LX.QQMusic.PlayReport, { reported: boolean, reason?: string }>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_report_play, async({ params }) => reportPlay(params))
}
