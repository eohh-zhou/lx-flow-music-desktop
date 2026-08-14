#!/usr/bin/env node

const MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

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
  return { comm, uin }
}

const requestMusicu = async (request, cookie) => {
  const { comm } = buildComm(cookie)
  const response = await fetch(MUSICU_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://y.qq.com/',
      Origin: 'https://y.qq.com',
      Cookie: cookie,
    },
    body: JSON.stringify({ comm, req_0: request }),
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

const getDaily30Request = cookie => {
  const { uin } = buildComm(cookie)
  const now = Math.floor(Date.now() / 1000)
  return {
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
      local_time: now,
      update_rtime: 1,
      ctx: 0,
      CountdownTime: 0,
    },
  }
}

const unwrap = response => {
  if (response.code !== 0) throw new Error(`outer code ${response.code}`)
  const item = response.req_0
  if (!item) throw new Error('response has no req_0 item')
  return item
}

const songSummary = song => ({
  id: String(song?.songid ?? song?.id ?? ''),
  mid: String(song?.songmid ?? song?.mid ?? ''),
  name: String(song?.songname ?? song?.songorig ?? song?.name ?? ''),
  singer: Array.isArray(song?.singer)
    ? song.singer.map(item => item?.name).filter(Boolean).join(' / ')
    : String(song?.singername ?? ''),
})

const main = async () => {
  const cookie = process.env.QQ_MUSIC_COOKIE?.trim() ?? ''
  if (!cookie) throw new Error('QQ_MUSIC_COOKIE is not set. Keep the cookie in the current process environment, not in a project file.')

  const request = getDaily30Request(cookie)
  const response = await requestMusicu(request, cookie)
  const item = unwrap(response)
  const data = item.data ?? {}
  const songs = Array.isArray(data.songlist) ? data.songlist : []
  const dirinfo = data.dirinfo ?? {}

  console.log(JSON.stringify({
    mode: 'read-only',
    request: {
      module: request.module,
      method: request.method,
      dirid: request.param.dirid,
      uinAttached: request.param.enc_host_uin !== '0',
    },
    response: {
      outerCode: response.code,
      moduleCode: item.code,
      moduleMessage: item.msg ?? '',
      dataCode: data.code ?? 0,
    },
    folder: {
      id: dirinfo.dirid ?? 0,
      name: dirinfo.dissname ?? dirinfo.title ?? '',
      songCount: data.total_song_num ?? dirinfo.songnum ?? songs.length,
      isDaily30: Number(dirinfo.dirid ?? 0) === 202,
    },
    songs: songs.map(songSummary).filter(song => song.id || song.mid || song.name),
  }, null, 2))

  if (item.code !== 0 || (data.code != null && data.code !== 0)) process.exitCode = 2
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
