import { httpFetch } from '@renderer/utils/request'
import { toNewMusicInfo } from '@common/utils/tools'
import { decodeName } from '@renderer/utils'
import txSearch from '@renderer/utils/musicSdk/tx/musicSearch'
import wySearch from '@renderer/utils/musicSdk/wy/musicSearch'
import { zzcSign } from '@renderer/utils/musicSdk/tx/utils/crypto'
import { eapi } from '@renderer/utils/musicSdk/wy/utils/crypto'
import { getBilibiliData } from '@renderer/utils/musicSdk/bili/utils'
import { getVisitorHeaders } from '@renderer/utils/musicSdk/bili/discovery'
import { toMusic } from '@renderer/utils/musicSdk/bili/songList'
import { getQQMusicDailyRecommend, getQQMusicStatus, getNeteaseMusicDailyRecommend, getNeteaseMusicStatus } from '@renderer/utils/ipc'
import { durationSeconds, isRecommendationTrack } from './ranking'
import type { RecommendationSource } from '@common/types/aiRecommendation'
import type { TrackRecommendation } from './ranking'

const cancelled = () => new Error('ai_recommend__error_cancelled')
export const checkCancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw cancelled() }

export const fetchBody = async(url: string, options: Record<string, unknown>, signal: AbortSignal, timeout = 12000) => {
  checkCancelled(signal)
  const task = httpFetch(url, { ...options, timeout }) as unknown as { promise: Promise<{ statusCode: number, body: any }>, cancelHttp?: () => void }
  const promise = task.promise
  const abort = () => task.cancelHttp?.()
  signal.addEventListener('abort', abort, { once: true })
  try {
    const response = await promise
    checkCancelled(signal)
    if (response.statusCode == 429) throw new Error('recommend__error_rate_limit')
    if (response.statusCode != 200) throw new Error('recommend__error_search')
    return response.body
  } finally { signal.removeEventListener('abort', abort) }
}

const toRows = (songs: any[], source: RecommendationSource, origin: TrackRecommendation['origin']): TrackRecommendation[] => songs.flatMap(raw => {
  const music = raw?.meta ? raw : toNewMusicInfo(raw)
  return isRecommendationTrack(music, source) ? [{ music, origin, reason: '' }] : []
})

export const searchTracks = async(source: RecommendationSource, keyword: string, signal: AbortSignal, requestedPage = 1): Promise<TrackRecommendation[]> => {
  checkCancelled(signal)
  const page = Math.min(5, Math.max(1, Math.floor(requestedPage) || 1))
  if (source == 'tx') {
    const data = {
      comm: { ct: '19', cv: '2151', uin: '0', tmeAppID: 'qqmusic', tmeLoginType: 0 },
      'music.search.SearchCgiService': {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: { grp: 1, num_per_page: 20, page_num: page, query: keyword, remoteplace: 'txt.newclient.top', search_type: 0, searchid: txSearch.getSearchId() },
      },
    }
    const sign = await zzcSign(JSON.stringify(data))
    const body = await fetchBody(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, { method: 'post', headers: { 'User-Agent': 'QQMusic 14090508(android 12)' }, body: data }, signal)
    const result = body?.['music.search.SearchCgiService'] ?? body?.req
    if (body?.code != 0 || result?.code != 0) throw new Error('recommend__error_search')
    return toRows(txSearch.handleResult(result.data?.body?.song?.list), source, 'search')
  }
  if (source == 'wy') {
    const body = await fetchBody('https://interface.music.163.com/eapi/batch', {
      method: 'post',
      headers: { 'User-Agent': 'Mozilla/5.0', origin: 'https://music.163.com' },
      form: eapi('/api/search/song/list/page', { keyword, needCorrect: '1', channel: 'typing', offset: (page - 1) * 20, scene: 'normal', total: true, limit: 20 }),
    }, signal)
    if (body?.code != 200) throw new Error('recommend__error_search')
    return toRows(wySearch.handleResult(body.data?.resources ?? []), source, 'search')
  }
  return searchBilibiliTracks(keyword, signal, 'totalrank', page)
}

const searchBilibiliTracks = async(keyword: string, signal: AbortSignal, order = 'totalrank', page = 1) => {
  const headers = await getVisitorHeaders()
  checkCancelled(signal)
  const data = await getBilibiliData('/x/web-interface/search/type', { search_type: 'video', keyword, order, tids: 3, page, page_size: 20 }, { signal, headers, timeout: 10000 })
  if (!Array.isArray(data.result)) throw new Error('recommend__error_search')
  return biliRows(data.result)
}

const biliRows = (videos: any[]): TrackRecommendation[] => toRows(videos.filter(video => /^BV[\da-z]{10}$/i.test(video?.bvid ?? '')).map(video => {
  const title = decodeName(video.title).replace(/<[^>]*>/g, '')
  const duration = typeof video.duration == 'number' ? video.duration : durationSeconds(video.duration)
  const music = toMusic({ ...video, title, duration, owner: { name: video.author ?? video.owner?.name ?? '' } }, { img: video.pic || video.cover || '' })
  music.singer = music.singer.replace(/【[^】]*】|\[[^\]]*\]/g, '').trim()
  return music
}), 'bili', 'search')

export const platformTracks = async(source: RecommendationSource, signal: AbortSignal): Promise<TrackRecommendation[]> => {
  checkCancelled(signal)
  if (source == 'bili') {
    return (await searchBilibiliTracks('音乐 单曲', signal, 'click')).map(row => ({ ...row, origin: 'popular' as const }))
  }
  const status = await (source == 'tx' ? getQQMusicStatus() : getNeteaseMusicStatus())
  checkCancelled(signal)
  if (!status.configured) throw new Error('recommend__login_required')
  const result = await (source == 'tx' ? getQQMusicDailyRecommend() : getNeteaseMusicDailyRecommend())
  checkCancelled(signal)
  return toRows(result.list, source, 'daily')
}
