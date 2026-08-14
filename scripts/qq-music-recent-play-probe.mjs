#!/usr/bin/env node

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'
const DEFAULT_SONG_MID = '0034Ge6Q2b504d'

const args = process.argv.slice(2)

const hasFlag = flag => args.includes(flag)
const getArg = (name, fallback = '') => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1] ?? fallback
}

const parseCookies = cookie => {
  const result = new Map()
  for (const part of cookie.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    result.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return result
}

const normalizeUin = value => {
  if (!value) return '0'
  const normalized = value.replace(/^o/, '').replace(/^0+(?=\d)/, '')
  return /^\d+$/.test(normalized) ? normalized : '0'
}

const getGtk = skey => {
  let hash = 5381
  for (const char of skey) hash += (hash << 5) + char.charCodeAt(0)
  return hash & 0x7fffffff
}

const buildComm = cookie => {
  const cookies = parseCookies(cookie)
  const uin = normalizeUin(cookies.get('uin') ?? cookies.get('p_uin') ?? cookies.get('wxuin'))
  const skey = cookies.get('p_skey') ?? cookies.get('skey') ?? ''
  const authst = cookies.get('qqmusic_key') ?? cookies.get('qm_keyst') ?? ''
  const loginType = cookies.get('tmeLoginType')
  const comm = {
    ct: 24,
    cv: 0,
    format: 'json',
    inCharset: 'utf-8',
    outCharset: 'utf-8',
    notice: 0,
    platform: 'yqq.json',
    needNewCode: 1,
    uin,
  }

  if (skey) comm.g_tk_new_20200303 = getGtk(skey)
  if (authst) comm.authst = authst
  if (loginType && /^\d+$/.test(loginType)) comm.tmeLoginType = Number(loginType)
  return comm
}

const requestMusicu = async (request, cookie = '') => {
  const response = await fetch(MUSICU_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://y.qq.com/',
      Origin: 'https://y.qq.com',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({
      comm: buildComm(cookie),
      req_0: request,
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`QQ Music returned non-JSON data: ${text.slice(0, 160)}`)
  }
}

const getModuleData = (response, operation) => {
  if (response.code !== 0) throw new Error(`${operation}: outer code ${response.code}`)
  const item = response.req_0
  if (!item) throw new Error(`${operation}: response has no req_0 item`)
  if (item.code !== 0) {
    const hint = item.code === 1000
      ? ' (login was rejected; refresh QQ_MUSIC_COOKIE)'
      : ''
    throw new Error(`${operation}: module code ${item.code}${hint}`)
  }
  return item.data ?? {}
}

const resolveSong = async (songMid, cookie) => {
  const response = await requestMusicu({
    module: 'music.pf_song_detail_svr',
    method: 'get_song_detail_yqq',
    param: {
      song_type: 0,
      song_mid: songMid,
    },
  }, cookie)
  const data = getModuleData(response, 'resolve song')
  const track = data.track_info
  if (!track?.id || !track?.album?.id) {
    throw new Error(`resolve song: incomplete metadata for ${songMid}`)
  }
  return {
    id: String(track.id),
    mid: String(track.mid ?? songMid),
    name: String(track.title ?? track.name ?? songMid),
    albumId: String(track.album.id),
    albumName: String(track.album.name ?? ''),
  }
}

const readRecent = async cookie => {
  const response = await requestMusicu({
    module: 'music.musicasset.PlayRecentlyRead',
    method: 'GetPlayRecentlyInfo',
    param: {
      type: 2,
      updateTime: 0,
      requestCnt: 100,
    },
  }, cookie)
  const data = getModuleData(response, 'read recent plays')
  if (data.code != null && data.code !== 0) {
    throw new Error(`read recent plays: data code ${data.code}`)
  }
  return {
    updateTime: Number(data.updateTime ?? 0),
    songs: data.data?.songList ?? [],
  }
}

const getTrackId = item => String(item?.track?.id ?? item?.songInfo?.id ?? '')

const summarizeMatch = (recent, song) => {
  const item = recent.songs.find(candidate => getTrackId(candidate) === song.id)
  return item
    ? {
        found: true,
        listenCnt: Number(item.listenCnt ?? 0),
        lastTime: Number(item.lastTime ?? 0),
      }
    : { found: false, listenCnt: 0, lastTime: 0 }
}

const writeRecent = async (cookie, song, listenCnt, lastTime) => {
  const response = await requestMusicu({
    module: 'music.musicasset.PlayRecentlyWrite',
    method: 'ReportPlayRecentlyInfo',
    param: {
      data: [{
        id: song.id,
        type: 2,
        lastTime,
        listenCnt,
        auxillaryID: song.albumId,
      }],
    },
  }, cookie)
  const data = getModuleData(response, 'write recent play')
  if (data.code != null && data.code !== 0) {
    throw new Error(`write recent play: data code ${data.code}`)
  }
  return data
}

const main = async () => {
  const write = hasFlag('--write')
  const confirmed = hasFlag('--confirm-write')
  const cookie = process.env.QQ_MUSIC_COOKIE?.trim() ?? ''
  const songMid = getArg('--song-mid', DEFAULT_SONG_MID)

  if (!cookie) {
    throw new Error('QQ_MUSIC_COOKIE is not set. Keep the cookie in the current process environment, not in a project file.')
  }
  if (write && !confirmed) {
    throw new Error('Writing is disabled unless --confirm-write is supplied explicitly.')
  }

  const song = await resolveSong(songMid, cookie)
  const before = await readRecent(cookie)
  const baseline = summarizeMatch(before, song)

  console.log(JSON.stringify({
    mode: write ? 'write-and-verify' : 'read-only',
    song,
    baseline,
    recentSongCount: before.songs.length,
  }, null, 2))

  if (!write) return

  const nextListenCnt = baseline.listenCnt + 1
  const lastTime = Math.floor(Date.now() / 1000)
  await writeRecent(cookie, song, nextListenCnt, lastTime)
  await new Promise(resolve => setTimeout(resolve, 1_500))

  const after = await readRecent(cookie)
  const verified = summarizeMatch(after, song)
  const success = verified.found &&
    verified.listenCnt >= nextListenCnt &&
    verified.lastTime >= lastTime

  console.log(JSON.stringify({
    requested: { listenCnt: nextListenCnt, lastTime },
    verified,
    success,
  }, null, 2))

  if (!success) process.exitCode = 2
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
