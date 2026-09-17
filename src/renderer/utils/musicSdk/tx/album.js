import { httpFetch } from '../../request'
import { formatPlayCount, decodeName } from '../../index'
import { filterMusicInfoItem } from './singer'

export default {
  getSearchId() {
    let guid = ''
    for (let i = 0; i < 32; i++) guid += Math.floor(Math.random() * 16).toString(16)
    return guid.toUpperCase() + String(Math.floor(Math.random() * 100000)).padStart(5, '0')
  },
  search(text, page, limit = 20, retryNum = 0) {
    if (retryNum > 5) throw new Error('max retry')
    return httpFetch(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=${page}&n=${limit}&w=${encodeURIComponent(text)}&format=json&inCharset=utf-8&outCharset=utf-8&t=8&cr=1&new_json=1`, {
      headers: {
        Referer: 'https://y.qq.com/',
      },
    }).promise.then(({ body }) => {
      if (!body || body.code != 0) return this.search(text, page, limit, ++retryNum)
      const album = body.data?.album || {}
      const rawList = album.list || []
      const list = rawList.map(item => {
        const info = item.album || item
        const mid = info.albumMID || info.albumMid || info.mid || info.album_mid
        const pic = String(info.albumPic || info.pic || (mid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${mid}.jpg` : '')).replace(/^http:\/\//i, 'https://')
        return {
          id: String(mid || info.albumID || info.id || ''),
          author: decodeName(info.singerName || info.singer_name || (info.singer_list || info.singerList || []).map(s => s.name).join('、') || ''),
          name: decodeName(info.albumName || info.album_name || info.name || ''),
          time: info.publicTime || info.public_time || info.publish_date || '',
          img: pic,
          songCount: info.song_count || info.songnum || info.songNum || 0,
          source: 'tx',
        }
      }).filter(item => item.id)
      return {
        list,
        limit,
        total: album.totalnum || album.total || list.length,
        source: 'tx',
      }
    })
  },
  async getAlbumDetail(id) {
    const body = await httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      body: {
        comm: { ct: 24, cv: 0, uin: 0 },
        req: {
          module: 'music.musichallAlbum.AlbumSongList',
          method: 'GetAlbumSongList',
          param: {
            albumMid: id,
            albumID: 0,
            begin: 0,
            num: 300,
            order: 2,
          },
        },
        req_1: {
          module: 'music.musichallAlbum.AlbumInfoServer',
          method: 'GetAlbumDetail',
          param: { albumMid: id },
        },
      },
    }).promise.then(result => result.body)
    if (body.code != 0) throw new Error('get album detail failed')
    const songs = body.req?.data?.songList || []
    const info = body.req_1?.data?.basicInfo || body.req_1?.data || {}
    const list = songs.map(item => filterMusicInfoItem(item.songInfo || item)).filter(Boolean)
    return {
      list,
      page: 1,
      limit: Math.max(list.length, 1),
      total: body.req?.data?.totalNum || list.length,
      source: 'tx',
      info: {
        name: info.albumName || info.name || '',
        img: info.pic || `https://y.gtimg.cn/music/photo_new/T002R500x500M000${id}.jpg`,
        desc: info.desc || '',
        author: info.singerName || (info.singer || []).map(s => s.name).join('、') || '',
        play_count: body.req?.data?.totalNum ? formatPlayCount(body.req.data.totalNum) : '',
      },
    }
  },
}
