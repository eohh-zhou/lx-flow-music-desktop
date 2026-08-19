import { BrowserWindow, safeStorage, session } from 'electron'
import { randomUUID } from 'node:crypto'
import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'
import { mainHandle } from '@common/mainIpc'
import { request } from '@common/utils/request'
import { STORE_NAMES } from '@common/constants'
import getStore from '@main/utils/store'

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const QQ_MUSIC_CREATE_PLAYLIST_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/create_playlist.fcg'
const QQ_MUSIC_ADD_TO_PLAYLIST_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/fcg_music_add2songdir.fcg'
const QQ_MUSIC_USER_PLAYLISTS_URL = 'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss'
const QQ_MUSIC_PLAYLIST_MAP_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/fcg_musiclist_getmyfav.fcg'
const QQ_MUSIC_PLAYLIST_DETAIL_URL = 'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg'
const COOKIE_KEY = 'cookie'
const QQ_MUSIC_LOGIN_PARTITION = 'qq-music-login'
const QQ_MUSIC_LOGIN_URL = 'https://y.qq.com/n/ryqq/profile'
const PLAYLIST_SYNC_PREVIEW_TTL = 10 * 60 * 1000
const PLAYLIST_SYNC_MAX_TRACKS = 1000
const PLAYLIST_SYNC_ADD_BATCH_SIZE = 20
const recentReports = new Map<string, number>()

interface ResolvedPlaylistSyncTrack extends LX.QQMusic.PlaylistSyncUnmatchedTrack {
  songId: string
  songMid: string
  songType: number
}

interface PendingPlaylistSync {
  name: string
  matched: ResolvedPlaylistSyncTrack[]
  unmatched: LX.QQMusic.PlaylistSyncUnmatchedTrack[]
  duplicates: number
  expiresAt: number
  playlistId?: string
  playlistTid?: string
  addedCount: number
  executing: boolean
}

const pendingPlaylistSyncs = new Map<string, PendingPlaylistSync>()
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

const clearQQMusicLoginSession = async() => getQQMusicLoginSession().clearStorageData({ storages: ['cookies'] })

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
  if (!item || item.code !== 0) {
    const message = String(item?.message ?? item?.msg ?? '').trim()
    throw new Error(`QQ Music module code ${item?.code ?? -1}${message ? `: ${message}` : ''}`)
  }
  return item.data ?? {}
}

const buildMobileComm = (cookie: string) => {
  const cookies = parseCookies(cookie)
  const uin = normalizeUin(cookies.get('uin') ?? cookies.get('p_uin') ?? cookies.get('wxuin'))
  const authst = cookies.get('qm_keyst') ?? cookies.get('qqmusic_key') ?? cookies.get('p_skey') ?? ''
  const guid = '2796982635'
  return {
    ct: 11,
    cv: 14090008,
    v: 14090008,
    chid: '10003505',
    qq: uin,
    authst,
    tmeAppID: 'qqmusic',
    tmeLoginType: Number(cookies.get('login_type') ?? cookies.get('tmeLoginType') ?? 2) || 2,
    QIMEI: '',
    QIMEI36: '',
    OpenUDID: guid,
    udid: guid,
    OpenUDID2: guid,
    aid: 'f4f65db268f95d9a',
    os_ver: '14',
    phonetype: 'M2012K11AC',
    devicelevel: '34',
    newdevicelevel: '34',
    rom: 'google/sdk_gphone64_x86_64/emu64xa:14/UPB5.230623.003/12077816:user/release-keys',
  }
}

const requestMobileMusicu = async(requestBody: Record<string, any>, cookie: string) => {
  const response = await request<Record<string, any>>(MUSICU_URL, {
    method: 'POST',
    json: { comm: buildMobileComm(cookie), req_0: requestBody },
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
      'User-Agent': 'QQMusic 14090008(android 14)',
      Cookie: cookie,
    },
    timeout: 30000,
  })
  if (response.statusCode !== 200) throw new Error(`QQ Music HTTP ${response.statusCode}`)
  const body = response.body
  if (Number(body.code ?? 0) != 0) throw new Error(`QQ Music outer code ${body.code}`)
  const item = body.req_0
  const code = Number(item?.code ?? -1)
  const data = item?.data ?? {}
  const retCode = Number(data.retCode ?? data.code ?? 0)
  if (code != 0 || retCode != 0) {
    const message = String(data.retMsg ?? data.msg ?? item?.message ?? item?.msg ?? '').trim()
    throw new Error(`QQ Music module code ${code} / retCode ${retCode}${message ? `: ${message}` : ''}`)
  }
  return data
}

const getQQMusicWebAuth = (cookie: string) => {
  const cookies = parseCookies(cookie)
  const uin = normalizeUin(cookies.get('uin') ?? cookies.get('p_uin') ?? cookies.get('wxuin'))
  const skey = cookies.get('p_skey') ?? cookies.get('skey') ?? ''
  return { uin, gtk: skey ? getGtk(skey) : 5381 }
}

const getQQMusicWebHeaders = (cookie: string) => ({
  Referer: 'https://y.qq.com/n/ryqq/profile',
  Origin: 'https://y.qq.com',
  Cookie: cookie,
})

const getQQMusicLegacyError = (operation: string, body: Record<string, any>) => {
  const code = Number(body.code ?? -1)
  const message = String(body.msg ?? body.message ?? '').trim()
  if (code == 1 || code == 1000) return new Error(`${operation}失败：QQ 音乐登录状态已失效，请在设置中重新登录`)
  return new Error(`${operation}失败：QQ 音乐返回 code ${code}${message ? `（${message}）` : ''}`)
}

const parseQQMusicLegacyBody = (body: unknown) => {
  if (body && typeof body == 'object') return body as Record<string, any>
  const text = String(body ?? '').trim().replace(/^[^(]+\((.*)\)\s*$/s, '$1')
  try {
    return JSON.parse(text) as Record<string, any>
  } catch {
    throw new Error(`QQ 音乐返回了无法解析的数据：${text.slice(0, 120)}`)
  }
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

const searchSongs = async(query: string) => {
  const response = await request<Record<string, any>>('https://c.y.qq.com/soso/fcgi-bin/client_search_cp', {
    method: 'GET',
    query: { format: 'json', p: 1, n: 8, w: query },
    headers: { Referer: 'https://y.qq.com/' },
    timeout: 30000,
  })
  if (response.statusCode !== 200 || response.body?.code !== 0) return []
  const list = response.body?.data?.song?.list
  return Array.isArray(list) ? list : []
}

const searchSong = async(_cookie: string, query: string) => (await searchSongs(query))[0] ?? null

const normalizeMatchText = (value: unknown) => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\b(feat|ft)\.?\s+.*$/i, '')
  .replace(/[\s\u3000·・,，.。!！?？'"“”‘’:：;；/\\|()[\]{}<>《》【】（）_-]+/g, '')

const parseIntervalSeconds = (interval: string | null | undefined) => {
  if (!interval) return 0
  const parts = interval.split(':').map(Number)
  if (!parts.length || parts.some(value => !Number.isFinite(value) || value < 0)) return 0
  return parts.reduce((total, value) => total * 60 + value, 0)
}

const getCandidateSinger = (candidate: Record<string, any>) => Array.isArray(candidate.singer)
  ? candidate.singer.map(item => String(item?.name ?? '')).filter(Boolean).join('、')
  : String(candidate.singername ?? candidate.singerName ?? '')

const scorePlaylistCandidate = (track: LX.QQMusic.PlaylistSyncTrackInput, candidate: Record<string, any>) => {
  const trackName = normalizeMatchText(track.name)
  const candidateName = normalizeMatchText(candidate.songname ?? candidate.title ?? candidate.name)
  if (!trackName || !candidateName) return 0
  const nameScore = trackName == candidateName
    ? 6
    : trackName.includes(candidateName) || candidateName.includes(trackName) ? 3 : 0
  if (!nameScore) return 0

  const trackSinger = normalizeMatchText(track.singer)
  const candidateSinger = normalizeMatchText(getCandidateSinger(candidate))
  const singerScore = !trackSinger
    ? 1
    : trackSinger == candidateSinger ? 4
      : trackSinger.includes(candidateSinger) || candidateSinger.includes(trackSinger) ? 2 : 0
  if (trackSinger && !singerScore) return 0

  const trackAlbum = normalizeMatchText(track.albumName)
  const candidateAlbum = normalizeMatchText(candidate.albumname ?? candidate.album?.name)
  const albumScore = trackAlbum && candidateAlbum && trackAlbum == candidateAlbum ? 1 : 0
  const trackSeconds = parseIntervalSeconds(track.interval)
  const candidateSeconds = Number(candidate.interval ?? candidate.duration ?? 0)
  const durationDifference = trackSeconds && candidateSeconds ? Math.abs(trackSeconds - candidateSeconds) : Number.POSITIVE_INFINITY
  const durationScore = durationDifference <= 3 ? 2 : durationDifference <= 8 ? 1 : 0
  return nameScore + singerScore + albumScore + durationScore
}

const toResolvedPlaylistTrack = (track: LX.QQMusic.PlaylistSyncTrackInput, candidate: Record<string, any>): ResolvedPlaylistSyncTrack | null => {
  const songId = String(candidate.id ?? candidate.songid ?? '')
  if (!/^\d+$/.test(songId) || songId == '0') return null
  return {
    id: track.id,
    name: track.name,
    singer: track.singer,
    songId,
    songMid: String(candidate.mid ?? candidate.songmid ?? ''),
    songType: Number(candidate.type ?? candidate.songtype ?? 0) || 0,
  }
}

const resolvePlaylistTrack = async(cookie: string, track: LX.QQMusic.PlaylistSyncTrackInput) => {
  const directSongId = String(track.qqSongId ?? '')
  if (track.source == 'tx' && /^\d+$/.test(directSongId) && directSongId != '0') {
    return toResolvedPlaylistTrack(track, { id: directSongId, mid: track.qqSongMid, type: 0 })
  }
  if (track.source == 'tx' && track.qqSongMid) {
    try {
      const data = await requestMusicu({
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail_yqq',
        param: { song_type: 0, song_mid: track.qqSongMid },
      }, cookie)
      const resolved = toResolvedPlaylistTrack(track, data.track_info ?? {})
      if (resolved) return resolved
    } catch {}
  }

  const candidates = await searchSongs(`${track.name} ${track.singer}`.trim())
  let bestCandidate: Record<string, any> | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const score = scorePlaylistCandidate(track, candidate)
    if (score <= bestScore) continue
    bestScore = score
    bestCandidate = candidate
  }
  return bestCandidate && bestScore >= 7 ? toResolvedPlaylistTrack(track, bestCandidate) : null
}

const mapWithConcurrency = async<Input, Output>(items: Input[], concurrency: number, mapper: (item: Input) => Promise<Output>) => {
  const result = new Array<Output>(items.length)
  let nextIndex = 0
  const worker = async() => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) return
      result[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return result
}

const cleanupPlaylistSyncs = () => {
  const now = Date.now()
  for (const [token, pending] of pendingPlaylistSyncs) {
    if (!pending.executing && pending.expiresAt <= now) pendingPlaylistSyncs.delete(token)
  }
}

const previewPlaylistSync = async(request: LX.QQMusic.PlaylistSyncPreviewRequest) => {
  const cookie = getRequiredCookie()
  const name = [...String(request?.name ?? '').trim()].slice(0, 40).join('')
  const tracks = Array.isArray(request?.tracks) ? request.tracks.slice(0, PLAYLIST_SYNC_MAX_TRACKS) : []
  if (!name) throw new Error('Playlist name is required')
  if (!tracks.length) throw new Error('Playlist is empty')

  cleanupPlaylistSyncs()
  const resolvedTracks = await mapWithConcurrency(tracks, 4, async(track) => {
    if (!track?.id || !track.name) return null
    try {
      return await resolvePlaylistTrack(cookie, track)
    } catch {
      return null
    }
  })
  const matched: ResolvedPlaylistSyncTrack[] = []
  const unmatched: LX.QQMusic.PlaylistSyncUnmatchedTrack[] = []
  const seenSongs = new Set<string>()
  let duplicates = 0
  for (let index = 0; index < tracks.length; index++) {
    const resolved = resolvedTracks[index]
    if (!resolved) {
      unmatched.push({ id: tracks[index].id, name: tracks[index].name, singer: tracks[index].singer })
      continue
    }
    const songKey = `${resolved.songId}:${resolved.songType}`
    if (seenSongs.has(songKey)) {
      duplicates++
      continue
    }
    seenSongs.add(songKey)
    matched.push(resolved)
  }
  const token = randomUUID()
  pendingPlaylistSyncs.set(token, {
    name,
    matched,
    unmatched,
    duplicates,
    expiresAt: Date.now() + PLAYLIST_SYNC_PREVIEW_TTL,
    addedCount: 0,
    executing: false,
  })
  return {
    token,
    name,
    total: tracks.length,
    matched: matched.length,
    duplicates,
    unmatched,
  } satisfies LX.QQMusic.PlaylistSyncPreview
}

const getCreatedPlaylistId = (data: Record<string, any>) => {
  const value = data.dirId ?? data.dirid ?? data.folderId ?? data.id ?? data.dirInfo?.dirId ?? data.dirinfo?.dirid
  const playlistId = String(value ?? '')
  return /^\d+$/.test(playlistId) && playlistId != '0' ? playlistId : ''
}

interface QQMusicPlaylistSummary {
  id: string
  tid: string
  name: string
}

const getQQMusicPlaylistSummaries = async(cookie: string) => {
  const { uin } = getQQMusicWebAuth(cookie)
  if (uin == '0') throw new Error('QQ 音乐登录状态缺少账号标识，请重新登录')
  const response = await request<Record<string, any> | string>(QQ_MUSIC_USER_PLAYLISTS_URL, {
    method: 'GET',
    query: {
      hostUin: 0,
      hostuin: uin,
      sin: 0,
      size: 200,
      g_tk: 5381,
      loginUin: 0,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf-8',
      notice: 0,
      platform: 'yqq.json',
      needNewCode: 0,
    },
    headers: {
      ...getQQMusicWebHeaders(cookie),
      Referer: 'https://y.qq.com/n/ryqq/profile',
    },
    timeout: 30000,
  })
  if (response.statusCode !== 200) throw new Error(`获取 QQ 音乐歌单失败：HTTP ${response.statusCode}`)
  const data = parseQQMusicLegacyBody(response.body)
  const code = Number(data?.code ?? -1)
  if (code == 4000) return []
  if (code != 0) throw getQQMusicLegacyError('获取 QQ 音乐歌单', data ?? {})
  const disslist = data.data?.disslist ?? data.disslist ?? []
  if (!Array.isArray(disslist)) return []
  return disslist.map((item: Record<string, any>) => ({
    id: String(item.dirid ?? item.dissid ?? item.id ?? ''),
    tid: String(item.tid ?? item.dissid ?? ''),
    name: String(item.diss_name ?? item.dissname ?? item.name ?? ''),
  } satisfies QQMusicPlaylistSummary)).filter(item => /^\d+$/.test(item.id) && item.id != '0' && item.name)
}

const findQQMusicPlaylist = async(cookie: string, name: string) => {
  const playlists = await getQQMusicPlaylistSummaries(cookie)
  return playlists.find(item => item.name == name) ?? null
}

const resolveQQMusicPlaylist = async(cookie: string, playlistId: string, name: string) => {
  let lastPlaylists: QQMusicPlaylistSummary[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 500))
    lastPlaylists = await getQQMusicPlaylistSummaries(cookie)
    const playlist = lastPlaylists.find(item => item.id == playlistId) ??
      lastPlaylists.find(item => item.tid == playlistId) ??
      lastPlaylists.find(item => item.name == name)
    if (playlist?.id && playlist.tid) return playlist
  }
  const playlist = lastPlaylists.find(item => item.id == playlistId) ?? lastPlaylists.find(item => item.name == name)
  return playlist ?? { id: playlistId, tid: '', name }
}

const collectQQMusicMapValues = (value: unknown, result: string[] = []) => {
  if (value == null) return result
  if (Array.isArray(value)) {
    for (const item of value) collectQQMusicMapValues(item, result)
    return result
  }
  if (typeof value == 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result.push(key)
      collectQQMusicMapValues(item, result)
    }
    return result
  }
  for (const item of String(value).split(',')) result.push(item.trim())
  return result
}

const addQQMusicSongKeys = (keys: Set<string>, songs: any[]) => {
  for (const song of songs) {
    const songId = String(song?.songid ?? song?.id ?? '')
    const songMid = String(song?.songmid ?? song?.mid ?? '')
    if (/^\d{5,}$/.test(songId)) keys.add(`id:${songId}`)
    if (/^[A-Za-z0-9]{10,20}$/.test(songMid)) keys.add(`mid:${songMid}`)
  }
}

const getQQMusicPlaylistSongKeys = async(cookie: string, playlist: QQMusicPlaylistSummary) => {
  const keys = new Set<string>()
  let lastError: unknown = null
  let readSucceeded = false
  try {
    const musicuKeys = await getQQMusicPlaylistSongKeysViaMusicu(cookie, playlist)
    for (const key of musicuKeys) keys.add(key)
    readSucceeded = true
  } catch (error) {
    lastError = error
  }

  if (playlist.tid) {
    try {
      const response = await request<Record<string, any> | string>(QQ_MUSIC_PLAYLIST_DETAIL_URL, {
        method: 'GET',
        query: {
          type: 1,
          utf8: 1,
          disstid: playlist.tid,
          loginUin: 0,
          format: 'json',
        },
        headers: {
          ...getQQMusicWebHeaders(cookie),
          Referer: 'https://y.qq.com/n/ryqq/playlist',
        },
        timeout: 30000,
      })
      if (response.statusCode !== 200) throw new Error(`读取 QQ 音乐歌单失败：HTTP ${response.statusCode}`)
      const data = parseQQMusicLegacyBody(response.body)
      const songs = data.cdlist?.[0]?.songlist ?? data.cdlist?.[0]?.list ?? []
      if (!Array.isArray(songs)) throw new Error('QQ Music playlist response has no songlist')
      addQQMusicSongKeys(keys, songs)
      readSucceeded = true
    } catch (error) {
      lastError = error
    }
  }

  try {
    const response = await request<Record<string, any> | string>(QQ_MUSIC_PLAYLIST_MAP_URL, {
      method: 'GET',
      query: {
        dirid: playlist.id,
        dirinfo: 1,
        g_tk: 5381,
        format: 'json',
      },
      headers: {
        ...getQQMusicWebHeaders(cookie),
        Referer: 'https://y.qq.com/n/ryqq/playlist',
      },
      timeout: 30000,
    })
    if (response.statusCode !== 200) throw new Error(`读取 QQ 音乐歌单失败：HTTP ${response.statusCode}`)
    const data = parseQQMusicLegacyBody(response.body)
    const code = Number(data?.code ?? -1)
    if (code != 0) throw getQQMusicLegacyError('读取 QQ 音乐歌单', data ?? {})
    for (const value of collectQQMusicMapValues(data.mapmid)) {
      if (/^[A-Za-z0-9]{10,20}$/.test(value)) keys.add(`mid:${value}`)
    }
    for (const value of collectQQMusicMapValues(data.map)) {
      if (/^\d{5,}$/.test(value)) keys.add(`id:${value}`)
    }
    readSucceeded = true
  } catch (error) {
    lastError = error
  }
  if (!readSucceeded && lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError))
  return keys
}

const getQQMusicTrackKeys = (track: { songId: string, songMid: string }) => [
  track.songMid ? `mid:${track.songMid}` : '',
  track.songId ? `id:${track.songId}` : '',
].filter(Boolean)

const getQQMusicPlaylistSongKeysViaMusicu = async(cookie: string, playlist: QQMusicPlaylistSummary) => {
  const { uin } = getQQMusicWebAuth(cookie)
  const requests = [
    ...(playlist.tid ? [{ disstid: Number(playlist.tid), dirid: 0, enc_host_uin: uin }] : []),
    { disstid: 0, dirid: Number(playlist.id), enc_host_uin: uin },
  ]
  let bestKeys = new Set<string>()
  let lastError: unknown = null
  for (const address of requests) {
    try {
      const data = await requestMusicu({
        module: 'music.srfDissInfo.DissInfo',
        method: 'CgiGetDiss',
        param: {
          new_format: 1,
          ...address,
          song_begin: 0,
          song_num: 1000,
          onlysonglist: 0,
          need_game_ad: 0,
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
      if (!Array.isArray(data.songlist)) throw new Error('QQ Music playlist response has no songlist')
      const keys = new Set<string>()
      addQQMusicSongKeys(keys, data.songlist)
      if (keys.size > bestKeys.size) bestKeys = keys
      if (bestKeys.size) return bestKeys
    } catch (error) {
      lastError = error
    }
  }
  if (!bestKeys.size && lastError) throw lastError instanceof Error ? lastError : new Error(String(lastError))
  return bestKeys
}

const verifyQQMusicPlaylistTracks = async(cookie: string, playlist: QQMusicPlaylistSummary, tracks: ResolvedPlaylistSyncTrack[]) => {
  let missing = tracks
  let lastError: unknown = null
  for (let attempt = 0; attempt < 5 && missing.length; attempt++) {
    try {
      const actualKeys = await getQQMusicPlaylistSongKeys(cookie, playlist)
      missing = tracks.filter(track => !getQQMusicTrackKeys(track).some(key => actualKeys.has(key)))
      if (!missing.length) return
    } catch (error) {
      lastError = error
    }
    if (missing.length && attempt < 4) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
  }
  if (lastError && missing.length == tracks.length) {
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }
  const sample = missing.slice(0, 3).map(track => `${track.name} - ${track.singer}`).join('、')
  throw new Error(`QQ 音乐歌单复核失败：接口返回成功，但仍缺少 ${missing.length} 首歌曲${sample ? `（例如：${sample}）` : ''}`)
}

const createQQMusicPlaylist = async(cookie: string, name: string) => {
  try {
    const data = await requestMusicu({
      module: 'music.musicasset.PlaylistBaseWrite',
      method: 'AddPlaylist',
      param: {
        dirName: name,
        bInteractive: false,
        bCoupleInteractive: false,
        bFmtUtf8: true,
        dirShow: 1,
        dirDesc: '',
      },
    }, cookie)
    const playlistId = getCreatedPlaylistId(data) ||
      getCreatedPlaylistId(data.result ?? {}) ||
      getCreatedPlaylistId(data.playlistBaseResult ?? {})
    if (playlistId) return playlistId
    throw new Error('QQ Music did not return the created playlist ID')
  } catch (error) {
    // Keep the legacy endpoint as a compatibility fallback for older accounts.
    if (error instanceof Error && error.message.includes('登录状态已失效')) throw error
  }
  const { uin, gtk } = getQQMusicWebAuth(cookie)
  const response = await request<Record<string, any> | string>(QQ_MUSIC_CREATE_PLAYLIST_URL, {
    method: 'POST',
    query: { g_tk: gtk },
    form: {
      loginUin: uin,
      hostUin: 0,
      format: 'json',
      inCharset: 'utf8',
      outCharset: 'utf8',
      notice: 0,
      platform: 'yqq',
      needNewCode: 0,
      g_tk: gtk,
      uin,
      name,
      show: 1,
      formsender: 1,
      utf8: 1,
      qzreferrer: 'https://y.qq.com/n/ryqq/profile',
    },
    headers: getQQMusicWebHeaders(cookie),
    timeout: 30000,
  })
  if (response.statusCode !== 200) throw new Error(`创建 QQ 音乐歌单失败：HTTP ${response.statusCode}`)
  const data = parseQQMusicLegacyBody(response.body)
  const code = Number(data?.code ?? -1)
  if (code == 21) {
    const existingPlaylist = await findQQMusicPlaylist(cookie, name)
    if (existingPlaylist) return existingPlaylist.id
    throw new Error(`创建 QQ 音乐歌单失败：已存在同名歌单“${name}”，但无法读取该歌单`)
  }
  if (code != 0) throw getQQMusicLegacyError('创建 QQ 音乐歌单', data ?? {})
  const playlistId = getCreatedPlaylistId(data)
  if (!playlistId) throw new Error('QQ Music did not return the created playlist ID')
  return playlistId
}

const getQQMusicPlaylistAddParams = (playlistId: string, tracks: ResolvedPlaylistSyncTrack[], useTrackType = false) => {
  const songMids = tracks.map(track => track.songMid).filter(Boolean)
  return {
    midlist: songMids.join(','),
    typelist: tracks.map(track => String(useTrackType ? Number(track.songType) || 0 : 13)).join(','),
    dirid: playlistId,
    addtype: '',
    formsender: 4,
    r2: 0,
    r3: 1,
    utf8: 1,
    g_tk: 5381,
  }
}

const requestQQMusicPlaylistAddViaMusicu = async(cookie: string, playlist: QQMusicPlaylistSummary, tracks: ResolvedPlaylistSyncTrack[]) => {
  const data = await requestMobileMusicu({
    module: 'music.musicasset.PlaylistDetailWrite',
    method: 'AddSonglist',
    param: {
      dirId: Number(playlist.id),
      tid: Number(playlist.tid || 0),
      bFmtUtf8: true,
      v_songInfo: tracks.map(track => ({
        songId: Number(track.songId),
        songType: Number(track.songType) || 0,
      })),
    },
  }, cookie)
  return { code: 0, data }
}

const requestQQMusicPlaylistAdd = async(cookie: string, playlist: QQMusicPlaylistSummary, tracks: ResolvedPlaylistSyncTrack[]) => {
  const attempts = [
    { method: 'GET' as const, query: getQQMusicPlaylistAddParams(playlist.id, tracks) },
    { method: 'GET' as const, query: getQQMusicPlaylistAddParams(playlist.id, tracks, true) },
    {
      method: 'POST' as const,
      form: {
        ...getQQMusicPlaylistAddParams(playlist.id, tracks),
        platform: 'yqq.post',
        source: 103,
      },
    },
  ]
  let lastData: Record<string, any> = { code: -1 }
  let lastVerificationError: Error | null = null
  try {
    const data = await requestQQMusicPlaylistAddViaMusicu(cookie, playlist, tracks)
    await verifyQQMusicPlaylistTracks(cookie, playlist, tracks)
    return data
  } catch (error) {
    lastVerificationError = error instanceof Error ? error : new Error(String(error))
  }
  for (const attempt of attempts) {
    const response = await request<Record<string, any> | string>(QQ_MUSIC_ADD_TO_PLAYLIST_URL, {
      method: attempt.method,
      ...(attempt.method == 'GET' ? { query: attempt.query } : { form: attempt.form }),
      headers: getQQMusicWebHeaders(cookie),
      timeout: 30000,
    })
    if (response.statusCode !== 200) throw new Error(`添加歌曲到 QQ 音乐歌单失败：HTTP ${response.statusCode}`)
    const data = parseQQMusicLegacyBody(response.body)
    lastData = data
    const code = Number(data?.code ?? -1)
    if (code == 0) {
      try {
        await verifyQQMusicPlaylistTracks(cookie, playlist, tracks)
        return data
      } catch (error) {
        lastVerificationError = error instanceof Error ? error : new Error(String(error))
        continue
      }
    }
    if (code != 403) throw getQQMusicLegacyError('添加歌曲到 QQ 音乐歌单', data ?? {})
  }
  if (lastVerificationError) throw lastVerificationError
  return lastData
}

const addQQMusicPlaylistTracks = async(
  cookie: string,
  playlist: QQMusicPlaylistSummary,
  tracks: ResolvedPlaylistSyncTrack[],
  onBatchAdded: (tracks: ResolvedPlaylistSyncTrack[]) => Promise<void>,
) => {
  if (!tracks.length) return
  const songMids = tracks.map(track => track.songMid).filter(Boolean)
  if (songMids.length != tracks.length) throw new Error('添加歌曲到 QQ 音乐歌单失败：部分歌曲缺少 QQ Music MID')
  let data: Record<string, any>
  try {
    data = await requestQQMusicPlaylistAdd(cookie, playlist, tracks)
  } catch (error) {
    if (tracks.length <= 1) throw error
    const midpoint = Math.ceil(tracks.length / 2)
    await addQQMusicPlaylistTracks(cookie, playlist, tracks.slice(0, midpoint), onBatchAdded)
    await addQQMusicPlaylistTracks(cookie, playlist, tracks.slice(midpoint), onBatchAdded)
    return
  }
  if (Number(data?.code ?? -1) == 403 && tracks.length > 1) {
    const midpoint = Math.ceil(tracks.length / 2)
    await addQQMusicPlaylistTracks(cookie, playlist, tracks.slice(0, midpoint), onBatchAdded)
    await addQQMusicPlaylistTracks(cookie, playlist, tracks.slice(midpoint), onBatchAdded)
    return
  }
  if (Number(data?.code ?? -1) != 0) throw getQQMusicLegacyError('添加歌曲到 QQ 音乐歌单', data ?? {})
  await onBatchAdded(tracks)
}

const commitPlaylistSync = async(request: LX.QQMusic.PlaylistSyncCommitRequest) => {
  const cookie = getRequiredCookie()
  cleanupPlaylistSyncs()
  const token = String(request?.token ?? '')
  const pending = pendingPlaylistSyncs.get(token)
  if (!pending || pending.expiresAt <= Date.now()) throw new Error('Playlist sync preview has expired')
  if (!pending.matched.length) throw new Error('No matched songs to sync')
  if (pending.executing) throw new Error('Playlist sync is already running')

  pending.executing = true
  pending.expiresAt = Date.now() + PLAYLIST_SYNC_PREVIEW_TTL
  try {
    const expectedTracks = pending.matched.slice()
    if (!pending.playlistId) {
      const existingPlaylist = await findQQMusicPlaylist(cookie, pending.name)
      if (existingPlaylist) {
        pending.playlistId = existingPlaylist.id
        pending.playlistTid = existingPlaylist.tid
        const existingKeys = await getQQMusicPlaylistSongKeys(cookie, existingPlaylist)
        const missingTracks = pending.matched.filter(track => !getQQMusicTrackKeys(track).some(key => existingKeys.has(key)))
        pending.duplicates += pending.matched.length - missingTracks.length
        pending.matched = missingTracks
        pending.addedCount = 0
      } else {
        const playlistId = await createQQMusicPlaylist(cookie, pending.name)
        await new Promise(resolve => setTimeout(resolve, 800))
        const playlist = await resolveQQMusicPlaylist(cookie, playlistId, pending.name)
        pending.playlistId = playlist.id
        pending.playlistTid = playlist.tid
      }
    }
    const playlist = {
      id: pending.playlistId,
      tid: pending.playlistTid ?? '',
      name: pending.name,
    }
    // QQ Music inserts each submitted track at the head of the playlist.
    // Reverse the queue so the remote playlist keeps the local playlist order.
    const tracksToAdd = pending.matched.slice().reverse()
    while (pending.addedCount < tracksToAdd.length) {
      const batch = tracksToAdd.slice(pending.addedCount, pending.addedCount + PLAYLIST_SYNC_ADD_BATCH_SIZE)
      await addQQMusicPlaylistTracks(cookie, playlist, batch, async addedTracks => {
        pending.addedCount += addedTracks.length
      })
    }
    await verifyQQMusicPlaylistTracks(cookie, playlist, expectedTracks)
    const result = {
      playlistId: pending.playlistId,
      name: pending.name,
      added: pending.addedCount,
      duplicates: pending.duplicates,
      unmatched: pending.unmatched.length,
    } satisfies LX.QQMusic.PlaylistSyncResult
    pendingPlaylistSyncs.delete(token)
    return result
  } finally {
    pending.executing = false
  }
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
  mainHandle<undefined, LX.QQMusic.LoginResult>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_login, async({ event }) => {
    return openQQMusicLogin(BrowserWindow.fromWebContents(event.sender))
  })
  mainHandle<LX.QQMusic.DailyRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_daily_recommend, getDailyRecommend)
  mainHandle<LX.QQMusic.RadarRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_radar_list, getRadarList)
  mainHandle<number, LX.QQMusic.DailyRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_radar_tracks, async({ params }) => getRadarTracks(params))
  mainHandle<LX.QQMusic.PlaylistRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_recommend_playlists, getRecommendPlaylists)
  mainHandle<number, LX.QQMusic.NewSongRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_new_songs, async({ params }) => getNewSongs(params))
  mainHandle<LX.QQMusic.PlayReport, { reported: boolean, reason?: string }>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_report_play, async({ params }) => reportPlay(params))
  mainHandle<LX.QQMusic.PlaylistSyncPreviewRequest, LX.QQMusic.PlaylistSyncPreview>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_playlist_sync_preview, async({ params }) => previewPlaylistSync(params))
  mainHandle<LX.QQMusic.PlaylistSyncCommitRequest, LX.QQMusic.PlaylistSyncResult>(WIN_MAIN_RENDERER_EVENT_NAME.qq_music_playlist_sync_commit, async({ params }) => commitPlaylistSync(params))
}
