import songList from './songList'
import { getBilibiliData, getVideoInfo, normalizeImage, parseMusicId } from './utils'

export default {
  musicSearch: null,
  hotSearch: null,
  leaderboard: null,
  singer: null,
  album: null,
  songList,
  getMusicUrl(songInfo) {
    return {
      promise: (async() => {
        const { bvid, page } = parseMusicId(songInfo.songmid)
        const video = await getVideoInfo(bvid)
        const part = video.pages?.find(part => part.page == page)
        if (!part?.cid) throw new Error('bilibili__error_missing')
        const data = await getBilibiliData('/x/player/playurl', { bvid, cid: part.cid, fnval: 16, fnver: 0 })
        // DASH audio is a complete audio-only stream. Video-only and segmented durl streams are unsuitable here.
        const audio = (data.dash?.audio ?? [])
          .filter(item => (item.mimeType ?? item.mime_type ?? 'audio/mp4') == 'audio/mp4' && (item.baseUrl ?? item.base_url))
          .sort((a, b) => b.bandwidth - a.bandwidth)[0]
        const urls = [audio?.baseUrl ?? audio?.base_url, ...(audio?.backupUrl ?? audio?.backup_url ?? [])]
          .filter(url => {
            try { return /^https?:$/.test(new URL(url).protocol) } catch { return false }
          })
        // Regional/PCDN edges can stall desktop clients; use the regular origin backup when provided.
        const isOrigin = url => /^upos-/.test(new URL(url).hostname)
        const url = urls.find(url => url.startsWith('https://') && isOrigin(url)) ?? urls.find(isOrigin) ?? urls[0]
        if (!url) throw new Error('bilibili__error_audio')
        return { type: '128k', url }
      })(),
    }
  },
  async getPic(songInfo) {
    if (songInfo.img) return songInfo.img
    const { bvid } = parseMusicId(songInfo.songmid)
    return normalizeImage((await getVideoInfo(bvid)).pic)
  },
  getLyric() {
    return { promise: Promise.resolve({ lyric: '' }) }
  },
  getMusicDetailPageUrl(songInfo) {
    const { bvid, page } = parseMusicId(songInfo.songmid)
    return `https://www.bilibili.com/video/${bvid}?p=${page}`
  },
}
