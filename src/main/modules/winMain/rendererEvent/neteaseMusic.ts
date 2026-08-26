import { BrowserWindow, safeStorage, session } from 'electron'
import { randomUUID } from 'node:crypto'
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
const PLAYLIST_SYNC_PREVIEW_TTL = 10 * 60 * 1000
const PLAYLIST_SYNC_MAX_TRACKS = 1000
const PLAYLIST_SYNC_ADD_BATCH_SIZE = 100

interface ResolvedPlaylistSyncTrack extends LX.NeteaseMusic.PlaylistSyncUnmatchedTrack {
  songId: string
}

interface PendingPlaylistSync {
  name: string
  matched: ResolvedPlaylistSyncTrack[]
  unmatched: LX.NeteaseMusic.PlaylistSyncUnmatchedTrack[]
  duplicates: number
  expiresAt: number
  playlistId?: string
  addedCount: number
  executing: boolean
}

interface NeteasePlaylistSummary {
  id: string
  name: string
  trackCount: number
}

const pendingPlaylistSyncs = new Map<string, PendingPlaylistSync>()

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
  return !!cookies.get('MUSIC_U') || !!cookies.get('MUSIC_A')
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

const getNeteaseMusicAccountPlaylists = async() => {
  const uid = await getNeteaseAccountUid()
  const body = await requestNetease('/weapi/user/playlist', {
    uid: Number(uid),
    limit: 1000,
    offset: 0,
    includeVideo: true,
  })
  const playlists = Array.isArray(body.playlist) ? body.playlist as Array<Record<string, any>> : []
  const list = playlists.map((item): LX.NeteaseMusic.AccountPlaylistItem => {
    const creator = item.creator && typeof item.creator == 'object' ? item.creator : {}
    const ownerId = String(item.userId ?? creator.userId ?? '')
    return {
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      author: String(creator.nickname ?? creator.name ?? '网易云音乐'),
      img: String(item.coverImgUrl ?? item.picUrl ?? ''),
      desc: String(item.description ?? item.copywriter ?? ''),
      playCount: Number(item.playCount ?? item.playcount ?? 0),
      trackCount: Number(item.trackCount ?? 0),
      subscribed: item.subscribed === true || (!!ownerId && ownerId != uid),
      specialType: Number(item.specialType ?? 0),
    }
  }).filter(item => /^\d+$/.test(item.id) && item.id != '0' && item.name)
  return { list } satisfies LX.NeteaseMusic.AccountPlaylists
}

const getNeteaseMusicAccountPlaylistDetail = async(requestInfo: LX.NeteaseMusic.AccountPlaylistDetailRequest) => {
  const id = String(requestInfo?.id ?? '')
  if (!/^\d+$/.test(id) || id == '0') throw new Error('网易云音乐歌单 ID 无效')

  const body = await requestNetease('/weapi/v6/playlist/detail', {
    id: Number(id),
    n: 100000,
    s: 8,
  })
  const playlist = body.playlist ?? {}
  const trackIds: string[] = Array.isArray(playlist.trackIds)
    ? playlist.trackIds.map((item: Record<string, any>) => String(item?.id ?? item ?? '')).filter((songId: string) => /^\d+$/.test(songId) && songId != '0')
    : []
  const songs: Array<Record<string, any>> = Array.isArray(playlist.tracks) ? [...playlist.tracks] : []
  const privileges: Array<Record<string, any>> = Array.isArray(body.privileges) ? [...body.privileges] : []

  if (trackIds.length > songs.length) {
    for (let offset = 0; offset < trackIds.length; offset += 500) {
      const batchIds = trackIds.slice(offset, offset + 500)
      const detail = await requestNetease('/weapi/v3/song/detail', {
        c: JSON.stringify(batchIds.map(songId => ({ id: Number(songId) }))),
        ids: JSON.stringify(batchIds.map(Number)),
      })
      if (Array.isArray(detail.songs)) songs.push(...detail.songs)
      if (Array.isArray(detail.privileges)) privileges.push(...detail.privileges)
    }
  }

  const songMap = new Map(songs.map(song => [String(song.id ?? song.songId ?? ''), song]))
  const privilegeMap = new Map(privileges.map(privilege => [String(privilege.id ?? ''), privilege]))
  const orderedSongs = trackIds.length
    ? trackIds.map(songId => songMap.get(songId)).filter((song): song is Record<string, any> => !!song)
    : songs
  const list = orderedSongs.map(song => toOldSong(song, privilegeMap.get(String(song.id ?? song.songId ?? '')) ?? {})).filter(Boolean) as Array<Record<string, any>>
  const creator = playlist.creator && typeof playlist.creator == 'object' ? playlist.creator : {}
  return {
    info: {
      name: String(playlist.name ?? '网易云音乐歌单'),
      desc: String(playlist.description ?? ''),
      img: String(playlist.coverImgUrl ?? list[0]?.img ?? ''),
      author: String(creator.nickname ?? creator.name ?? '网易云音乐'),
      playCount: Number(playlist.playCount ?? 0),
    },
    list,
    total: Number(playlist.trackCount ?? (trackIds.length || list.length)),
  } satisfies LX.NeteaseMusic.AccountPlaylistDetail
}

const normalizePlaylistMatchText = (value: unknown) => String(value ?? '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/\b(feat|ft)\.?\s+.*$/i, '')
  .replace(/[\s\u3000·・,，.。!！?？'"“”‘’:：;；/\\|()[\]{}<>《》【】（）_-]+/g, '')

const parsePlaylistIntervalSeconds = (interval: string | null | undefined) => {
  if (!interval) return 0
  const parts = interval.split(':').map(Number)
  if (!parts.length || parts.some(value => !Number.isFinite(value) || value < 0)) return 0
  return parts.reduce((total, value) => total * 60 + value, 0)
}

const getNeteaseCandidateSinger = (candidate: Record<string, any>) => {
  const singers = candidate.ar ?? candidate.artists ?? []
  return Array.isArray(singers) ? singers.map(item => String(item?.name ?? '')).filter(Boolean).join('、') : ''
}

const scorePlaylistCandidate = (track: LX.NeteaseMusic.PlaylistSyncTrackInput, candidate: Record<string, any>) => {
  const trackName = normalizePlaylistMatchText(track.name)
  const candidateName = normalizePlaylistMatchText(candidate.name)
  if (!trackName || !candidateName) return 0
  const nameScore = trackName == candidateName
    ? 6
    : trackName.includes(candidateName) || candidateName.includes(trackName) ? 3 : 0
  if (!nameScore) return 0

  const trackSinger = normalizePlaylistMatchText(track.singer)
  const candidateSinger = normalizePlaylistMatchText(getNeteaseCandidateSinger(candidate))
  const singerScore = !trackSinger
    ? 1
    : !candidateSinger ? 0
        : trackSinger == candidateSinger ? 4
          : trackSinger.includes(candidateSinger) || candidateSinger.includes(trackSinger) ? 2 : 0
  if (trackSinger && !singerScore) return 0

  const trackAlbum = normalizePlaylistMatchText(track.albumName)
  const candidateAlbum = normalizePlaylistMatchText(candidate.al?.name ?? candidate.album?.name)
  const albumScore = trackAlbum && candidateAlbum && trackAlbum == candidateAlbum ? 1 : 0
  const trackSeconds = parsePlaylistIntervalSeconds(track.interval)
  const candidateSeconds = Math.round(Number(candidate.dt ?? candidate.duration ?? 0) / 1000)
  const durationDifference = trackSeconds && candidateSeconds ? Math.abs(trackSeconds - candidateSeconds) : Number.POSITIVE_INFINITY
  const durationScore = durationDifference <= 3 ? 2 : durationDifference <= 8 ? 1 : 0
  return nameScore + singerScore + albumScore + durationScore
}

const toResolvedPlaylistTrack = (track: LX.NeteaseMusic.PlaylistSyncTrackInput, songId: unknown): ResolvedPlaylistSyncTrack | null => {
  const resolvedSongId = String(songId ?? '')
  if (!/^\d+$/.test(resolvedSongId) || resolvedSongId == '0') return null
  return { id: track.id, name: track.name, singer: track.singer, songId: resolvedSongId }
}

const resolvePlaylistTrack = async(track: LX.NeteaseMusic.PlaylistSyncTrackInput) => {
  if (track.source == 'wy' && track.neteaseSongId) {
    const resolved = toResolvedPlaylistTrack(track, track.neteaseSongId)
    if (resolved) return resolved
  }
  const body = await requestNetease('/weapi/cloudsearch/get/web', {
    s: `${track.name} ${track.singer}`.trim(),
    type: 1,
    limit: 10,
    offset: 0,
    total: true,
  })
  const candidates = Array.isArray(body.result?.songs) ? body.result.songs as Array<Record<string, any>> : []
  let bestCandidate: Record<string, any> | null = null
  let bestScore = 0
  for (const candidate of candidates) {
    const score = scorePlaylistCandidate(track, candidate)
    if (score <= bestScore) continue
    bestScore = score
    bestCandidate = candidate
  }
  return bestCandidate && bestScore >= 7 ? toResolvedPlaylistTrack(track, bestCandidate.id) : null
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

const previewPlaylistSync = async(request: LX.NeteaseMusic.PlaylistSyncPreviewRequest) => {
  getRequiredCookie()
  const name = [...String(request?.name ?? '').trim()].slice(0, 40).join('')
  const tracks = Array.isArray(request?.tracks) ? request.tracks.slice(0, PLAYLIST_SYNC_MAX_TRACKS) : []
  if (!name) throw new Error('歌单名称不能为空')
  if (!tracks.length) throw new Error('歌单中没有歌曲')

  cleanupPlaylistSyncs()
  const resolvedTracks = await mapWithConcurrency(tracks, 4, async(track) => {
    if (!track?.id || !track.name) return null
    try {
      return await resolvePlaylistTrack(track)
    } catch {
      return null
    }
  })
  const matched: ResolvedPlaylistSyncTrack[] = []
  const unmatched: LX.NeteaseMusic.PlaylistSyncUnmatchedTrack[] = []
  const seenSongs = new Set<string>()
  let duplicates = 0
  for (let index = 0; index < tracks.length; index++) {
    const resolved = resolvedTracks[index]
    if (!resolved) {
      unmatched.push({ id: tracks[index].id, name: tracks[index].name, singer: tracks[index].singer })
      continue
    }
    if (seenSongs.has(resolved.songId)) {
      duplicates++
      continue
    }
    seenSongs.add(resolved.songId)
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
  } satisfies LX.NeteaseMusic.PlaylistSyncPreview
}

const getNeteaseAccountUid = async() => {
  const body = await requestNetease('/weapi/w/nuser/account/get')
  const uid = String(body.profile?.userId ?? body.account?.id ?? '')
  if (!/^\d+$/.test(uid) || uid == '0') throw new Error('网易云音乐登录状态缺少账号标识，请重新登录')
  return uid
}

const getNeteasePlaylistSummaries = async() => {
  const uid = await getNeteaseAccountUid()
  const body = await requestNetease('/weapi/user/playlist', {
    uid: Number(uid),
    limit: 1000,
    offset: 0,
    includeVideo: true,
  })
  const playlists = Array.isArray(body.playlist) ? body.playlist as Array<Record<string, any>> : []
  return playlists.map(item => ({
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    trackCount: Number(item.trackCount ?? 0),
    ownerId: String(item.userId ?? item.creator?.userId ?? ''),
    subscribed: item.subscribed === true,
    specialType: Number(item.specialType ?? 0),
  })).filter(item => /^\d+$/.test(item.id) && item.id != '0' && item.name && item.ownerId == uid && !item.subscribed && item.specialType == 0)
    .map(({ id, name, trackCount }) => ({ id, name, trackCount } satisfies NeteasePlaylistSummary))
}

const findNeteasePlaylist = async(name: string) => {
  const playlists = await getNeteasePlaylistSummaries()
  return playlists.find(item => item.name == name) ?? null
}

const resolveNeteasePlaylist = async(playlistId: string, name: string) => {
  let lastPlaylists: NeteasePlaylistSummary[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 500))
    lastPlaylists = await getNeteasePlaylistSummaries()
    const playlist = lastPlaylists.find(item => item.id == playlistId) ?? lastPlaylists.find(item => item.name == name)
    if (playlist) return playlist
  }
  return { id: playlistId, name, trackCount: 0 }
}

const createNeteasePlaylist = async(name: string) => {
  try {
    const body = await requestNetease('/weapi/playlist/create', { name, privacy: 0 })
    const playlistId = String(body.playlist?.id ?? body.id ?? '')
    if (/^\d+$/.test(playlistId) && playlistId != '0') return playlistId
    throw new Error('网易云音乐未返回新建歌单 ID')
  } catch (error) {
    const existing = await findNeteasePlaylist(name)
    if (existing) return existing.id
    throw error
  }
}

const getNeteasePlaylistSongIds = async(playlist: NeteasePlaylistSummary) => {
  const body = await requestNetease('/weapi/v6/playlist/detail', {
    id: Number(playlist.id),
    n: 100000,
    s: 8,
  })
  const trackIds = Array.isArray(body.playlist?.trackIds) ? body.playlist.trackIds : []
  const songs = trackIds.length ? trackIds : Array.isArray(body.playlist?.tracks) ? body.playlist.tracks : []
  return songs.map((item: Record<string, any>) => String(item?.id ?? item ?? ''))
    .filter((id: string) => /^\d+$/.test(id) && id != '0')
}

const verifyNeteasePlaylistTracks = async(playlist: NeteasePlaylistSummary, tracks: ResolvedPlaylistSyncTrack[]) => {
  let missing = tracks
  let orderMatches = false
  let lastError: unknown = null
  const expectedIds = tracks.map(track => track.songId)
  const expectedIdSet = new Set(expectedIds)
  for (let attempt = 0; attempt < 5 && (missing.length || !orderMatches); attempt++) {
    try {
      const actualIds: string[] = await getNeteasePlaylistSongIds(playlist)
      const actualIdSet = new Set(actualIds)
      missing = tracks.filter(track => !actualIdSet.has(track.songId))
      orderMatches = actualIds.filter(id => expectedIdSet.has(id)).join(',') == expectedIds.join(',')
      if (!missing.length && orderMatches) return
    } catch (error) {
      lastError = error
    }
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
  }
  if (lastError && missing.length == tracks.length) throw lastError instanceof Error ? lastError : new Error(String(lastError))
  if (!missing.length && !orderMatches) throw new Error('网易云音乐歌单顺序复核失败：歌曲已添加，但顺序与本地歌单不一致')
  const sample = missing.slice(0, 3).map(track => `${track.name} - ${track.singer}`).join('、')
  throw new Error(`网易云音乐歌单复核失败：仍缺少 ${missing.length} 首歌曲${sample ? `（例如：${sample}）` : ''}`)
}

const requestNeteasePlaylistAdd = async(playlist: NeteasePlaylistSummary, tracks: ResolvedPlaylistSyncTrack[]) => {
  const ids = tracks.map(track => Number(track.songId))
  await requestNetease('/weapi/playlist/manipulate/tracks', {
    op: 'add',
    pid: Number(playlist.id),
    trackIds: JSON.stringify(ids),
    tracks: JSON.stringify(ids),
    imme: 'true',
  })
}

const addNeteasePlaylistTracks = async(
  playlist: NeteasePlaylistSummary,
  tracks: ResolvedPlaylistSyncTrack[],
  onBatchAdded: (tracks: ResolvedPlaylistSyncTrack[]) => void,
) => {
  if (!tracks.length) return
  try {
    await requestNeteasePlaylistAdd(playlist, tracks)
  } catch (error) {
    if (tracks.length <= 1) throw error
    const midpoint = Math.ceil(tracks.length / 2)
    await addNeteasePlaylistTracks(playlist, tracks.slice(0, midpoint), onBatchAdded)
    await addNeteasePlaylistTracks(playlist, tracks.slice(midpoint), onBatchAdded)
    return
  }
  onBatchAdded(tracks)
}

const updateNeteasePlaylistOrder = async(playlist: NeteasePlaylistSummary, tracks: ResolvedPlaylistSyncTrack[]) => {
  const expectedIds = tracks.map(track => track.songId)
  const expectedIdSet = new Set(expectedIds)
  let currentIds: string[] = []
  for (let attempt = 0; attempt < 5; attempt++) {
    currentIds = await getNeteasePlaylistSongIds(playlist)
    if (expectedIds.every(id => currentIds.includes(id))) break
    if (attempt < 4) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
  }
  const missingIds = expectedIds.filter(id => !currentIds.includes(id))
  if (missingIds.length) throw new Error(`网易云音乐歌单排序失败：仍有 ${missingIds.length} 首歌曲尚未写入`)
  const desiredIds = [
    ...expectedIds,
    ...currentIds.filter(id => !expectedIdSet.has(id)),
  ]
  if (desiredIds.join(',') == currentIds.join(',')) return
  await requestNetease('/weapi/playlist/manipulate/tracks', {
    op: 'update',
    pid: Number(playlist.id),
    trackIds: JSON.stringify(desiredIds),
  })
}

const commitPlaylistSync = async(request: LX.NeteaseMusic.PlaylistSyncCommitRequest) => {
  getRequiredCookie()
  cleanupPlaylistSyncs()
  const token = String(request?.token ?? '')
  const pending = pendingPlaylistSyncs.get(token)
  if (!pending || pending.expiresAt <= Date.now()) throw new Error('歌单同步预览已过期，请重新匹配')
  if (!pending.matched.length) throw new Error('没有可同步的已匹配歌曲')
  if (pending.executing) throw new Error('歌单同步正在进行中')

  pending.executing = true
  pending.expiresAt = Date.now() + PLAYLIST_SYNC_PREVIEW_TTL
  try {
    const expectedTracks = pending.matched.slice()
    if (!pending.playlistId) {
      const existingPlaylist = await findNeteasePlaylist(pending.name)
      if (existingPlaylist) {
        pending.playlistId = existingPlaylist.id
        const existingIds = new Set(await getNeteasePlaylistSongIds(existingPlaylist))
        const missingTracks = pending.matched.filter(track => !existingIds.has(track.songId))
        pending.duplicates += pending.matched.length - missingTracks.length
        pending.matched = missingTracks
      } else {
        const playlistId = await createNeteasePlaylist(pending.name)
        await new Promise(resolve => setTimeout(resolve, 800))
        const playlist = await resolveNeteasePlaylist(playlistId, pending.name)
        pending.playlistId = playlist.id
      }
    }
    const playlist = await resolveNeteasePlaylist(pending.playlistId, pending.name)
    const currentIds = new Set(await getNeteasePlaylistSongIds(playlist))
    const tracksToAdd = pending.matched.filter(track => !currentIds.has(track.songId))
    pending.addedCount = pending.matched.length - tracksToAdd.length
    for (let index = 0; index < tracksToAdd.length; index += PLAYLIST_SYNC_ADD_BATCH_SIZE) {
      const batch = tracksToAdd.slice(index, index + PLAYLIST_SYNC_ADD_BATCH_SIZE)
      await addNeteasePlaylistTracks(playlist, batch, addedTracks => {
        pending.addedCount += addedTracks.length
      })
    }
    await updateNeteasePlaylistOrder(playlist, expectedTracks)
    await verifyNeteasePlaylistTracks(playlist, expectedTracks)
    const result = {
      playlistId: playlist.id,
      name: pending.name,
      added: pending.addedCount,
      duplicates: pending.duplicates,
      unmatched: pending.unmatched.length,
    } satisfies LX.NeteaseMusic.PlaylistSyncResult
    pendingPlaylistSyncs.delete(token)
    return result
  } finally {
    pending.executing = false
  }
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
  mainHandle<LX.NeteaseMusic.AccountPlaylists>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_account_playlists, getNeteaseMusicAccountPlaylists)
  mainHandle<LX.NeteaseMusic.AccountPlaylistDetailRequest, LX.NeteaseMusic.AccountPlaylistDetail>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_account_playlist_detail, async({ params }) => getNeteaseMusicAccountPlaylistDetail(params))
  mainHandle<LX.NeteaseMusic.SongRecommend>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_new_songs, getNewSongs)
  mainHandle<LX.NeteaseMusic.PlaylistSyncPreviewRequest, LX.NeteaseMusic.PlaylistSyncPreview>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_playlist_sync_preview, async({ params }) => previewPlaylistSync(params))
  mainHandle<LX.NeteaseMusic.PlaylistSyncCommitRequest, LX.NeteaseMusic.PlaylistSyncResult>(WIN_MAIN_RENDERER_EVENT_NAME.netease_music_playlist_sync_commit, async({ params }) => commitPlaylistSync(params))
}
