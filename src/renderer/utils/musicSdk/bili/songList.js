import { formatPlayTime } from '@common/utils/common'
import { getBilibiliData, getVideoInfo, normalizeImage, parseBilibiliListInput, resolveBilibiliListId } from './utils'
import { discoverPlaylists } from './discovery'
import { parseTrackMetadata } from './metadata'

const limit = 20
export const toMusic = (item, { page = 1, name = item.title, uploader = item.upper?.name ?? item.owner?.name ?? '', albumName = item.title, duration = item.duration, img = item.cover ?? item.pic } = {}) => ({
  ...parseTrackMetadata(name, albumName),
  bilibili: { rawTitle: name, uploader },
  source: 'bili',
  songmid: `${item.bvid}_${page}`,
  albumName,
  interval: formatPlayTime(Number(duration) || 0),
  img: normalizeImage(img),
  types: [{ type: '128k', size: null }],
  _types: { '128k': { size: null } },
  typeUrl: {},
})

const isAvailable = item => /^BV[\da-z]{10}$/i.test(item.bvid ?? '') && (item.type == null || item.type == 2) && !/^(已失效视频|视频已失效|失效视频|已删除视频)$/.test(item.title)

export default {
  sortList: [],
  search: null,
  getTags: null,
  getList: (sort, category, page) => discoverPlaylists({ sort, category, page }),
  async getListDetail(rawId, page = 1) {
    const key = await resolveBilibiliListId(rawId)
    const input = parseBilibiliListInput(key)
    if (!Number.isInteger(page) || page < 1) throw new Error('bilibili__error_input')
    let list, total, info
    if (input.type == 'video') {
      const video = await getVideoInfo(input.id)
      if (!video.bvid || !video.pages?.length) throw new Error('bilibili__error_missing')
      total = video.pages.length
      list = video.pages.slice((page - 1) * limit, page * limit).map(part => toMusic(video, {
        page: part.page,
        name: total > 1 ? part.part : video.title,
        duration: part.duration,
      }))
      info = { name: video.title, img: normalizeImage(video.pic), desc: video.desc ?? '', author: video.owner?.name ?? '', play_count: String(video.stat?.view ?? '') }
    } else if (input.type == 'fav') {
      const data = await getBilibiliData('/x/v3/fav/resource/list', { media_id: input.id, pn: page, ps: limit, order: 'mtime', platform: 'web' })
      if (!data.info || (data.medias != null && !Array.isArray(data.medias))) throw new Error('bilibili__error_request')
      list = (data.medias ?? []).filter(isAvailable).map(item => toMusic(item))
      total = Number(data.info.media_count) || 0
      if (data.has_more) total = Math.max(total, page * limit + 1)
      info = { name: data.info.title, img: normalizeImage(data.info.cover), desc: data.info.intro ?? '', author: data.info.upper?.name ?? '', play_count: String(data.info.cnt_info?.play ?? '') }
    } else if (input.type == 'season') {
      const data = await getBilibiliData('/x/polymer/web-space/seasons_archives_list', { mid: input.mid, season_id: input.id, sort_reverse: false, page_num: page, page_size: limit })
      if (!data.meta || !Array.isArray(data.archives)) throw new Error('bilibili__error_request')
      list = data.archives.filter(isAvailable).map(item => toMusic(item, { uploader: data.meta.upper?.name ?? String(input.mid) }))
      total = Number(data.page?.total ?? data.meta.total) || 0
      info = { name: data.meta.name, img: normalizeImage(data.meta.cover), desc: data.meta.description ?? '', author: data.meta.upper?.name ?? String(input.mid), play_count: '' }
    } else {
      const [data, detail] = await Promise.all([
        getBilibiliData('/x/series/archives', { mid: input.mid, series_id: input.id, only_normal: true, sort: 'asc', pn: page, ps: limit }),
        getBilibiliData('/x/series/series', { series_id: input.id }),
      ])
      if (!detail.meta || !Array.isArray(data.archives)) throw new Error('bilibili__error_request')
      list = data.archives.filter(isAvailable).map(item => toMusic(item, { uploader: String(input.mid) }))
      total = Number(data.page?.total ?? detail.meta.total) || 0
      info = { name: detail.meta.name, img: normalizeImage(detail.meta.cover ?? data.archives[0]?.pic), desc: detail.meta.description ?? '', author: String(input.mid), play_count: '' }
    }
    return { id: key, list, page, limit, total, source: 'bili', info }
  },

  getDetailPageUrl(rawId) {
    const input = parseBilibiliListInput(rawId)
    switch (input.type) {
      case 'fav': return `https://www.bilibili.com/medialist/detail/ml${input.id}`
      case 'video': return `https://www.bilibili.com/video/${input.id}`
      case 'season':
      case 'series': return `https://space.bilibili.com/${input.mid}/lists/${input.id}?type=${input.type}`
      default: return input.url
    }
  },
}
